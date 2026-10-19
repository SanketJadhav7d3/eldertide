"""PPO with action masking and self-play for Eldertide.

    cd rl
    python -m eldertide_rl.train.ppo --smoke --run-dir /tmp/smoke         # checks everything in ~a minute
    python -m eldertide_rl.train.ppo --run-dir /content/drive/MyDrive/eldertide/run1

Rerunning with the same --run-dir resumes from the last checkpoint (the network, the optimiser, the
step count and the opponent pool), so a disconnected Colab session loses at most a few minutes.

Each update: every game plays `rollout_steps` decisions; the learner's seats are stored; advantages
are computed separately for the win/loss and the shaping reward (each with its own gamma and value
head) and mixed, with the shaping share fading to zero; then a clipped PPO update.
Opponents per game: the learner itself, a saved earlier version, RushBot or RandomBot.
Progress goes to <run-dir>/metrics.csv, one row per update.
"""

from __future__ import annotations

import csv
import json
import os
import random
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from ..config import EnvConfig
from ..env import DuelEnv
from .games import LEARNER, PAST, VecGames
from .model import EldertideNet, to_tensors
from .settings import OPPONENTS, TrainSettings, parse_settings
from .storage import Rollout, pad_observations

METRICS = ["update", "env_steps", "minutes", "steps_per_second", "learning_rate", "shaping_weight", "policy_loss",
           "value_loss", "entropy", "approx_kl", "clip_fraction", "mean_actors", "samples", "games_finished",
           "win_rush", "win_random", "win_past", "mean_game_decisions", "pool_size",
           "seconds_games", "seconds_network", "seconds_learning", "skipped_steps"]


def build_model(settings: TrainSettings, height: int, width: int, device) -> EldertideNet:
    return EldertideNet(height, width, settings.channels, settings.deep_channels, settings.high_blocks,
                        settings.low_blocks, settings.key_dim).to(device)


def grid_size() -> tuple:
    env = DuelEnv(EnvConfig(mask_format="actors"))
    env.reset(seed=0)
    return env.game.height, env.game.width


class Trainer:
    def __init__(self, settings: TrainSettings):
        self.s = settings
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        torch.backends.cudnn.benchmark = True  # pick the fastest convolution kernels for these sizes
        self.timing = {"games": 0.0, "network": 0.0}
        self.run_dir = Path(settings.run_dir)
        self.pool_dir = self.run_dir / "pool"
        self.pool_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_path = self.run_dir / "checkpoint.pt"
        self.metrics_path = self.run_dir / "metrics.csv"

        reward = EnvConfig().reward
        if abs(settings.gamma_shaping - reward.gamma) > 1e-12:
            raise ValueError(f"gamma_shaping ({settings.gamma_shaping}) must equal the reward's gamma ({reward.gamma}) "
                             "for the shaping to be potential-based")

        self.height, self.width = grid_size()
        self.model = build_model(settings, self.height, self.width, self.device)
        self.past = build_model(settings, self.height, self.width, self.device).eval()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=settings.learning_rate, eps=1e-5)
        amp = settings.mixed_precision and self.device.type == "cuda"
        self.model.mixed_precision = self.past.mixed_precision = amp
        self.scaler = torch.amp.GradScaler("cuda", enabled=amp)
        self.update = 0
        self.env_steps = 0
        self.pool: list = []  # file names in pool_dir, oldest first
        self.results = {name: deque(maxlen=100) for name in OPPONENTS}  # learner score per finished game
        self.lengths = deque(maxlen=100)
        self.games_finished = 0
        self.seconds = 0.0
        self._load()
        self.rng = np.random.default_rng(settings.seed + 7919 * self.update)
        torch.manual_seed(settings.seed + self.update)
        random.seed(settings.seed + self.update)

    # ---------------------------------------------------------------- saving

    def _load(self):
        if not self.checkpoint_path.exists():
            print(f"Starting a new run in {self.run_dir}")
            return
        state = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
        self.model.load_state_dict(state["model"])
        self.optimizer.load_state_dict(state["optimizer"])
        self.update, self.env_steps, self.seconds = state["update"], state["env_steps"], state["seconds"]
        self.pool = [name for name in state["pool"] if (self.pool_dir / name).exists()]
        self.games_finished = state["games_finished"]
        for name, values in state["results"].items():
            self.results[name].extend(values)
        self.lengths.extend(state["lengths"])
        print(f"Resumed {self.run_dir} at update {self.update} ({self.env_steps:,} env steps, "
              f"{len(self.pool)} saved opponents)")

    def save(self):
        state = {
            "model": self.model.state_dict(), "optimizer": self.optimizer.state_dict(),
            "update": self.update, "env_steps": self.env_steps, "seconds": self.seconds, "pool": self.pool,
            "games_finished": self.games_finished, "results": {k: list(v) for k, v in self.results.items()},
            "lengths": list(self.lengths), "settings": self.s.to_dict(),
            "grid": [self.height, self.width],
        }
        tmp = self.checkpoint_path.with_suffix(".tmp")
        torch.save(state, tmp)
        os.replace(tmp, self.checkpoint_path)  # never leaves a half-written checkpoint

    def snapshot(self):
        name = f"policy_{self.update:07d}.pt"
        torch.save(self.model.state_dict(), self.pool_dir / name)
        self.pool.append(name)
        while len(self.pool) > self.s.pool_size:
            old = self.pool.pop(0)
            (self.pool_dir / old).unlink(missing_ok=True)

    # ---------------------------------------------------------------- schedules

    @property
    def total_updates(self) -> int:
        return max(1, self.s.total_env_steps // (self.s.games * self.s.rollout_steps))

    def learning_rate(self) -> float:
        left = max(0.0, 1.0 - self.update / self.total_updates)
        return self.s.learning_rate * (self.s.final_lr_fraction + (1 - self.s.final_lr_fraction) * left)

    def shaping_weight(self) -> float:
        if self.s.shaping_fade_steps <= 0:
            return 0.0
        return max(0.0, 1.0 - self.env_steps / self.s.shaping_fade_steps)

    def opponent_probs(self) -> tuple:
        probs = list(self.s.opponent_probs)
        if not self.pool:  # nobody saved yet: play itself instead
            probs[OPPONENTS.index("self")] += probs[OPPONENTS.index("past")]
            probs[OPPONENTS.index("past")] = 0.0
        return tuple(probs)

    # ---------------------------------------------------------------- acting

    @torch.inference_mode()
    def act(self, model, obs_list):
        start = time.perf_counter()
        batch = pad_observations(obs_list)
        out = model(to_tensors(batch, self.device))
        actions, logprob, _, values = (x.cpu().numpy() for x in out)
        self.timing["network"] += time.perf_counter() - start
        return actions, logprob, values

    def collect(self, games: VecGames, reports: list):
        s = self.s
        G, T = s.games, s.rollout_steps
        rollout = Rollout(T, G)
        if self.pool:
            name = self.pool[int(self.rng.integers(len(self.pool)))]
            self.past.load_state_dict(torch.load(self.pool_dir / name, map_location=self.device, weights_only=True))
        actors = []
        for t in range(T):
            chosen = [dict() for _ in range(G)]
            for kind, model in ((LEARNER, self.model), (PAST, self.past)):
                keys = [(g, p) for g, rep in enumerate(reports) for p in (0, 1) if rep.kinds[p] == kind]
                if not keys:
                    continue
                obs_list = [reports[g].obs[p] for g, p in keys]
                actions, logprob, values = self.act(model, obs_list)
                for i, (g, p) in enumerate(keys):
                    rows = actions[i, :len(obs_list[i].cells)]
                    chosen[g][p] = rows
                    if kind == LEARNER:
                        rollout.add(t, g, p, obs_list[i], rows, logprob[i], values[i])
                        actors.append(len(rows))
            start = time.perf_counter()
            new_reports = games.step(chosen, self.opponent_probs())
            self.timing["games"] += time.perf_counter() - start
            for g, rep in enumerate(new_reports):
                s0 = Rollout.seq(g, 0)
                rollout.rewards[t, s0:s0 + 2] = rep.rewards
                rollout.dones[t, s0:s0 + 2] = rep.done
                if rep.finished:
                    self.record(rep.finished)
            reports = new_reports
            self.env_steps += G

        # Values of the states after the last step, for the learner's seats.
        next_values = np.zeros((2 * G, 2), dtype=np.float32)
        keys = [(g, p) for g, rep in enumerate(reports) for p in (0, 1) if rep.kinds[p] == LEARNER]
        if keys:
            _, _, values = self.act(self.model, [reports[g].obs[p] for g, p in keys])
            for i, (g, p) in enumerate(keys):
                next_values[Rollout.seq(g, p)] = values[i]
        return rollout, next_values, reports, (float(np.mean(actors)) if actors else 0.0)

    def record(self, finished: dict):
        self.games_finished += 1
        self.lengths.append(finished["decisions"])
        if finished["opponent"] == "self":
            return
        seat = finished["kinds"].index(LEARNER)
        winner = finished["winner"]
        self.results[finished["opponent"]].append(1.0 if winner == seat else 0.5 if winner == -1 else 0.0)

    # ---------------------------------------------------------------- learning

    def learn(self, rollout: Rollout, next_values: np.ndarray) -> dict:
        s = self.s
        adv, ret = rollout.advantages(next_values, (s.gamma_win, s.gamma_shaping), s.gae_lambda)
        batch = rollout.batch(adv, ret)
        weight = self.shaping_weight()
        batch["mixed_adv"] = (batch["adv"][:, 0] + weight * batch["adv"][:, 1]).astype(np.float32)
        n = len(batch["logprob"])
        for group in self.optimizer.param_groups:
            group["lr"] = self.learning_rate()
        stats = {"policy_loss": [], "value_loss": [], "entropy": [], "approx_kl": [], "clip_fraction": []}
        skipped = 0
        self.model.train()
        order = np.arange(n)
        for _ in range(s.epochs):
            self.rng.shuffle(order)
            for part in np.array_split(order, min(s.minibatches, n)):
                mb = to_tensors({k: v[part] for k, v in batch.items()}, self.device)
                _, logprob, entropy, values = self.model(mb, actions=mb["actions"])
                log_ratio = logprob - mb["logprob"]
                ratio = log_ratio.exp()
                a = mb["mixed_adv"]
                if len(part) > 1:
                    a = (a - a.mean()) / (a.std() + 1e-8)
                policy_loss = torch.max(-a * ratio, -a * ratio.clamp(1 - s.clip, 1 + s.clip)).mean()
                value_loss = 0.5 * ((values - mb["ret"]) ** 2).mean()
                loss = policy_loss - s.entropy_coef * entropy.mean() + s.value_coef * value_loss
                self.optimizer.zero_grad(set_to_none=True)
                if not torch.isfinite(loss):
                    skipped += 1  # never let a bad number reach the weights
                    continue
                self.scaler.scale(loss).backward()
                self.scaler.unscale_(self.optimizer)
                nn.utils.clip_grad_norm_(self.model.parameters(), s.max_grad_norm)
                self.scaler.step(self.optimizer)  # skips the step itself if a gradient overflowed
                self.scaler.update()
                with torch.no_grad():
                    stats["policy_loss"].append(policy_loss.item())
                    stats["value_loss"].append(value_loss.item())
                    stats["entropy"].append(entropy.mean().item())
                    stats["approx_kl"].append(((ratio - 1) - log_ratio).mean().item())
                    stats["clip_fraction"].append(((ratio - 1).abs() > s.clip).float().mean().item())
        self.model.eval()
        out = {k: float(np.mean(v)) if v else float("nan") for k, v in stats.items()}
        out["samples"] = n
        out["skipped_steps"] = skipped
        return out

    # ---------------------------------------------------------------- main loop

    def log(self, row: dict):
        new = not self.metrics_path.exists()
        if not new:  # a file from an older version: rewrite it with the current columns
            with open(self.metrics_path, newline="") as f:
                rows = list(csv.DictReader(f))
            if rows and list(rows[0].keys()) != METRICS:
                with open(self.metrics_path, "w", newline="") as f:
                    writer = csv.DictWriter(f, fieldnames=METRICS)
                    writer.writeheader()
                    writer.writerows({k: r.get(k, "") for k in METRICS} for r in rows)
        with open(self.metrics_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=METRICS)
            if new:
                writer.writeheader()
            writer.writerow({k: row.get(k, "") for k in METRICS})

    def win_rate(self, name: str):
        values = self.results[name]
        return round(float(np.mean(values)), 3) if values else ""

    def run(self):
        s = self.s
        (self.run_dir / "settings.json").write_text(json.dumps(s.to_dict(), indent=2))
        print(f"Device: {self.device}; grid {self.height}x{self.width}; {s.games} games in {s.workers} workers; "
              f"{sum(p.numel() for p in self.model.parameters()):,} parameters; "
              f"{self.total_updates} updates planned")
        games = VecGames(s.workers, s.games_per_worker, seed=s.seed + 1000 * self.update)
        last_save = time.time()
        try:
            reports = games.reset(self.opponent_probs())
            while self.env_steps < s.total_env_steps:
                start = time.time()
                self.timing = {"games": 0.0, "network": 0.0}
                rollout, next_values, reports, mean_actors = self.collect(games, reports)
                learn_start = time.time()
                stats = self.learn(rollout, next_values)
                seconds_learning = time.time() - learn_start
                self.update += 1
                elapsed = time.time() - start
                self.seconds += elapsed
                if self.update % s.snapshot_every == 0:
                    self.snapshot()
                if self.update % s.log_every == 0:
                    row = {"update": self.update, "env_steps": self.env_steps, "minutes": round(self.seconds / 60, 2),
                           "steps_per_second": round(s.games * s.rollout_steps / elapsed, 1),
                           "learning_rate": self.learning_rate(), "shaping_weight": round(self.shaping_weight(), 4),
                           "mean_actors": round(mean_actors, 1), "games_finished": self.games_finished,
                           "win_rush": self.win_rate("rush"), "win_random": self.win_rate("random"),
                           "win_past": self.win_rate("past"),
                           "mean_game_decisions": round(float(np.mean(self.lengths)), 1) if self.lengths else "",
                           "pool_size": len(self.pool), **{k: round(v, 5) for k, v in stats.items()},
                           "seconds_games": round(self.timing["games"], 2),
                           "seconds_network": round(self.timing["network"], 2),
                           "seconds_learning": round(seconds_learning, 2)}
                    self.log(row)
                    print(f"update {self.update:5d} | {self.env_steps:>10,} steps | {row['steps_per_second']:6.1f} steps/s"
                          f" | win vs rush {row['win_rush']} random {row['win_random']} past {row['win_past']}"
                          f" | kl {row['approx_kl']:.4f} entropy {row['entropy']:.2f}"
                          f" | time: games {row['seconds_games']:.1f}s network {row['seconds_network']:.1f}s"
                          f" learning {row['seconds_learning']:.1f}s", flush=True)
                if time.time() - last_save >= s.checkpoint_minutes * 60:
                    self.save()
                    last_save = time.time()
        except KeyboardInterrupt:
            print("Stopped; saving a checkpoint.")
        finally:
            self.save()
            games.close()
        print(f"Saved {self.checkpoint_path}")


def main(argv=None):
    Trainer(parse_settings(argv)).run()


if __name__ == "__main__":
    main()
