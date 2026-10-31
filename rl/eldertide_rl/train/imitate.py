"""Imitation learning: trains the network to give the orders the teacher (imitation.TeacherRushBot)
would give, as a warm start for PPO.

    cd rl
    python -m eldertide_rl.train.imitate --smoke --run-dir /tmp/imitation_smoke
    python -m eldertide_rl.train.imitate --run-dir /content/drive/MyDrive/eldertide/imitation
    python -m eldertide_rl.train.ppo --run-dir .../run4 --init-from .../imitation/checkpoint.pt --bc-coef 0.1

Games run as in PPO (train/games.py, with `imitation` on): in every game the teacher labels each
learner seat at every decision with its orders, translated into the agent's action format. Each
learner seat is played either by the teacher or by the network; the teacher's share falls from
teacher_share_start to teacher_share_end, so more and more of the positions trained on are ones the
network reached itself (DAgger), where a plain copy would never have seen the teacher play.

The loss is the labels' negative log-probability (summed over a seat's actors, as PPO's
log-probabilities are) plus the value heads' error on the games' returns, so PPO starts with a
critic as well. Progress: how often the network's own label choice matches the teacher's, and its
score against RushBot and RandomBot in the games it played itself. Checkpoints have the same layout
as PPO's, so `ppo --init-from` can start from one. Rerunning with the same --run-dir resumes.
"""

from __future__ import annotations

import csv
import json
import os
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .games import LEARNER, VecGames
from .model import load_weights, to_tensors
from .ppo import build_model, grid_size
from .settings import OPPONENTS, ImitationSettings, parse_dataclass
from .storage import Rollout, pad_observations

METRICS = ["update", "env_steps", "minutes", "steps_per_second", "learning_rate", "teacher_share", "bc_loss",
           "value_loss", "type_accuracy", "order_accuracy", "label_orders", "illegal_labels", "samples",
           "games_finished", "copy_vs_rush", "copy_vs_random", "seconds_games", "seconds_network",
           "seconds_learning"]

# A label whose log-probability is below this was masked as illegal: it is left out of the loss
# (it should never happen; the count is logged).
ILLEGAL = -1e5


class Imitator:
    def __init__(self, settings: ImitationSettings):
        self.s = settings
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        torch.backends.cudnn.benchmark = True
        self.run_dir = Path(settings.run_dir)
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_path = self.run_dir / "checkpoint.pt"
        self.metrics_path = self.run_dir / "metrics.csv"
        self.height, self.width = grid_size()
        self.model = build_model(settings, self.height, self.width, self.device)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=settings.learning_rate, eps=1e-5)
        amp = settings.mixed_precision and self.device.type == "cuda"
        self.model.mixed_precision = amp
        self.scaler = torch.amp.GradScaler("cuda", enabled=amp)
        self.update = 0
        self.env_steps = 0
        self.seconds = 0.0
        self.games_finished = 0
        # The network's score in the games it played itself (win 1, draw 0.5), last 100 per opponent.
        self.results = {name: deque(maxlen=100) for name in ("rush", "random")}
        self.timing = {"games": 0.0, "network": 0.0}
        self._load()
        torch.manual_seed(settings.seed + self.update)
        self.rng = np.random.default_rng(settings.seed + 7919 * self.update)

    # ---------------------------------------------------------------- saving

    def _load(self):
        if not self.checkpoint_path.exists():
            print(f"Starting imitation in {self.run_dir}")
            return
        state = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
        load_weights(self.model, state["model"])
        self.optimizer.load_state_dict(state["optimizer"])
        self.update, self.env_steps, self.seconds = state["update"], state["env_steps"], state["seconds"]
        self.games_finished = state["games_finished"]
        for name, values in state["results"].items():
            if name in self.results:
                self.results[name].extend(values)
        print(f"Resumed imitation in {self.run_dir} at update {self.update} ({self.env_steps:,} env steps)")

    def save(self):
        state = {
            "model": self.model.state_dict(), "optimizer": self.optimizer.state_dict(),
            "update": self.update, "env_steps": self.env_steps, "seconds": self.seconds, "pool": [],
            "games_finished": self.games_finished, "results": {k: list(v) for k, v in self.results.items()},
            "lengths": [], "settings": self.s.to_dict(), "grid": [self.height, self.width], "imitation": True,
        }
        tmp = self.checkpoint_path.with_suffix(".tmp")
        torch.save(state, tmp)
        os.replace(tmp, self.checkpoint_path)

    # ---------------------------------------------------------------- schedules

    @property
    def total_updates(self) -> int:
        return max(1, self.s.total_env_steps // (self.s.games * self.s.rollout_steps))

    def learning_rate(self) -> float:
        left = max(0.0, 1.0 - self.update / self.total_updates)
        return self.s.learning_rate * (self.s.final_lr_fraction + (1 - self.s.final_lr_fraction) * left)

    def teacher_share(self) -> float:
        s = self.s
        done = min(1.0, self.env_steps / max(1, s.teacher_share_steps))
        return s.teacher_share_start + (s.teacher_share_end - s.teacher_share_start) * done

    # ---------------------------------------------------------------- playing

    @torch.inference_mode()
    def act(self, obs_list):
        start = time.perf_counter()
        actions, _, _, values = (x.cpu().numpy() for x in self.model(to_tensors(pad_observations(obs_list), self.device)))
        self.timing["network"] += time.perf_counter() - start
        return actions, values

    def collect(self, games: VecGames, reports: list):
        s = self.s
        G, T = s.games, s.rollout_steps
        rollout = Rollout(T, G)
        probs, share = s.opponent_probs, self.teacher_share()
        orders = labels = 0
        for t in range(T):
            chosen = [dict() for _ in range(G)]
            keys = [(g, p) for g, rep in enumerate(reports) for p in (0, 1) if rep.kinds[p] == LEARNER]
            if keys:
                obs_list = [reports[g].obs[p] for g, p in keys]
                actions, values = self.act(obs_list)
                for i, (g, p) in enumerate(keys):
                    k = len(obs_list[i].cells)
                    chosen[g][p] = actions[i, :k]
                    label = reports[g].labels[p]
                    rollout.add(t, g, p, obs_list[i], label, 0.0, values[i])
                    orders += int((label[:, 0] != 0).sum())
                    labels += k
            start = time.perf_counter()
            new_reports = games.step(chosen, probs, share)
            self.timing["games"] += time.perf_counter() - start
            for g, rep in enumerate(new_reports):
                s0 = Rollout.seq(g, 0)
                rollout.rewards[t, s0:s0 + 2] = rep.rewards
                rollout.dones[t, s0:s0 + 2] = rep.done
                if rep.finished:
                    self.record(rep.finished)
            reports = new_reports
            self.env_steps += G
        next_values = np.zeros((2 * G, 2), dtype=np.float32)
        keys = [(g, p) for g, rep in enumerate(reports) for p in (0, 1) if rep.kinds[p] == LEARNER]
        if keys:
            _, values = self.act([reports[g].obs[p] for g, p in keys])
            for i, (g, p) in enumerate(keys):
                next_values[Rollout.seq(g, p)] = values[i]
        return rollout, next_values, reports, orders / max(1, labels)

    def record(self, finished: dict):
        if finished.get("replay"):
            print(f"  replay saved: {finished['replay']}", flush=True)
        self.games_finished += 1
        if finished["opponent"] not in self.results:
            return
        seat = finished["kinds"].index(LEARNER)
        if finished["driven"][seat]:
            return  # the teacher played it: says nothing about the network
        winner = finished["winner"]
        self.results[finished["opponent"]].append(1.0 if winner == seat else 0.5 if winner == -1 else 0.0)

    # ---------------------------------------------------------------- learning

    def learn(self, rollout: Rollout, next_values: np.ndarray) -> dict:
        s = self.s
        _, ret = rollout.advantages(next_values, (s.gamma_win, s.gamma_shaping), s.gae_lambda)
        batch = rollout.batch(np.zeros_like(ret), ret)
        n = len(batch["logprob"])
        for group in self.optimizer.param_groups:
            group["lr"] = self.learning_rate()
        stats = {"bc_loss": [], "value_loss": []}
        illegal = 0
        self.model.train()
        order = np.arange(n)
        for _ in range(s.epochs):
            self.rng.shuffle(order)
            for part in np.array_split(order, min(s.minibatches, n)):
                mb = to_tensors({k: v[part] for k, v in batch.items()}, self.device)
                _, logprob, _, values = self.model(mb, actions=mb["actions"])  # "actions" are the labels
                legal = logprob > ILLEGAL
                illegal += int((~legal).sum())
                bc_loss = -(logprob * legal).sum() / legal.sum().clamp(min=1)
                value_loss = 0.5 * ((values - mb["ret"]) ** 2).mean()
                loss = bc_loss + s.value_coef * value_loss
                self.optimizer.zero_grad(set_to_none=True)
                if not torch.isfinite(loss):
                    continue
                self.scaler.scale(loss).backward()
                self.scaler.unscale_(self.optimizer)
                nn.utils.clip_grad_norm_(self.model.parameters(), s.max_grad_norm)
                self.scaler.step(self.optimizer)
                self.scaler.update()
                stats["bc_loss"].append(bc_loss.item())
                stats["value_loss"].append(value_loss.item())
        self.model.eval()
        out = {k: float(np.mean(v)) if v else float("nan") for k, v in stats.items()}
        out.update(self.accuracy(batch), samples=n, illegal_labels=illegal)
        return out

    @torch.inference_mode()
    def accuracy(self, batch: dict, limit: int = 256) -> dict:
        """How often the network's most likely order type is the teacher's: over every actor, and over
        actors the teacher gave a real order (not noop) to."""
        idx = self.rng.choice(len(batch["logprob"]), size=min(limit, len(batch["logprob"])), replace=False)
        mb = to_tensors({k: v[idx] for k, v in batch.items()}, self.device)
        chosen = self.model(mb, greedy=True)[0][..., 0]
        label = mb["actions"][..., 0]
        valid = mb["valid"]
        orders = valid & (label != 0)
        same = chosen == label
        return {"type_accuracy": float((same & valid).sum() / valid.sum().clamp(min=1)),
                "order_accuracy": float((same & orders).sum() / orders.sum().clamp(min=1))}

    # ---------------------------------------------------------------- main loop

    def log(self, row: dict):
        new = not self.metrics_path.exists()
        with open(self.metrics_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=METRICS)
            if new:
                writer.writeheader()
            writer.writerow({k: row.get(k, "") for k in METRICS})

    def score(self, name: str):
        values = self.results[name]
        return round(float(np.mean(values)), 3) if values else ""

    def run(self):
        s = self.s
        (self.run_dir / "settings.json").write_text(json.dumps(s.to_dict(), indent=2))
        print(f"Device: {self.device}; grid {self.height}x{self.width}; {s.games} games in {s.workers} workers; "
              f"{self.total_updates} updates planned")
        games = VecGames(s.workers, s.games_per_worker, seed=s.seed + 1000 * self.update,
                         replay_dir=str(self.run_dir / "replays"), replay_every=s.replay_every, imitation=True,
                         start=s.start)
        last_save = time.time()
        try:
            reports = games.reset(s.opponent_probs, self.teacher_share())
            while self.env_steps < s.total_env_steps:
                start = time.time()
                self.timing = {"games": 0.0, "network": 0.0}
                rollout, next_values, reports, label_orders = self.collect(games, reports)
                learn_start = time.time()
                stats = self.learn(rollout, next_values)
                seconds_learning = time.time() - learn_start
                self.update += 1
                elapsed = time.time() - start
                self.seconds += elapsed
                row = {"update": self.update, "env_steps": self.env_steps, "minutes": round(self.seconds / 60, 2),
                       "steps_per_second": round(s.games * s.rollout_steps / elapsed, 1),
                       "learning_rate": self.learning_rate(), "teacher_share": round(self.teacher_share(), 3),
                       "label_orders": round(label_orders, 3), "games_finished": self.games_finished,
                       "copy_vs_rush": self.score("rush"), "copy_vs_random": self.score("random"),
                       **{k: round(v, 4) for k, v in stats.items()},
                       "seconds_games": round(self.timing["games"], 2),
                       "seconds_network": round(self.timing["network"], 2),
                       "seconds_learning": round(seconds_learning, 2)}
                self.log(row)
                print(f"update {self.update:5d} | {self.env_steps:>10,} steps | {row['steps_per_second']:6.1f} steps/s"
                      f" | copy vs rush {row['copy_vs_rush']} random {row['copy_vs_random']}"
                      f" | teacher {row['teacher_share']:.2f} | loss {row['bc_loss']:.3f} value {row['value_loss']:.3f}"
                      f" | match: all {row['type_accuracy']:.3f} orders {row['order_accuracy']:.3f}"
                      + (f" | ILLEGAL LABELS {stats['illegal_labels']}" if stats["illegal_labels"] else ""), flush=True)
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
    Imitator(parse_dataclass(ImitationSettings, argv, "Imitation learning for Eldertide: copy the teacher bot.")).run()


if __name__ == "__main__":
    main()
