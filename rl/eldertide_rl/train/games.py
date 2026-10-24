"""Many duels at once, stepped in worker processes, for collecting training experience.

Each game has two seats. When a game starts, an opponent is drawn (see settings.OPPONENTS):
  self    both seats are played by the learner (both seats' experience is trained on)
  past    one seat by the learner, the other by a saved earlier version of it
  rush    one seat by the learner, the other by RushBot
  random  one seat by the learner, the other by RandomBot
Seats played by a network ("learner" or "past") are sent back to the main process, which picks
their actions; bots act inside the worker. Games restart on their own when they end.

Everything here is NumPy, so it is tested without PyTorch (tests/test_train_games.py).
"""

from __future__ import annotations

import multiprocessing as mp
from pathlib import Path
from dataclasses import dataclass

import numpy as np

from ..bots import RandomBot, RushBot
from ..config import EnvConfig
from ..env import DuelEnv
from ..replay import ReplayRecorder
from .settings import OPPONENTS

# How each kind of player is named in replays.
PLAYER_NAMES = {"self": ("Agent", "Agent"), "past": ("Agent", "Agent (earlier)"), "rush": ("Agent", "RushBot"),
                "random": ("Agent", "RandomBot")}

LEARNER, PAST, BOT = "learner", "past", "bot"


@dataclass
class SeatObs:
    """What a network needs to choose a seat's actions (all in that seat's own view)."""
    planes: np.ndarray  # uint8 [H, W, C]: the observation planes scaled to 0..255
    globals: np.ndarray  # float32 [G]
    cells: np.ndarray  # int64 [K, 2]: each actor's (x, y)
    type: np.ndarray  # bool [K, n_types]
    local: np.ndarray  # bool [K, n_heads, 225]
    build_kind: np.ndarray  # bool [K, 4]
    train_kind: np.ndarray  # bool [K, 4]
    region: np.ndarray  # bool [n_regions]

    @staticmethod
    def from_obs(obs: dict) -> "SeatObs":
        m = obs["masks"]
        return SeatObs(
            planes=np.round(obs["planes"] * 255).astype(np.uint8),
            globals=obs["globals"].astype(np.float32),
            cells=m["cells"], type=m["type"], local=m["local"], build_kind=m["build_kind"],
            train_kind=m["train_kind"], region=m["region"],
        )


@dataclass
class GameReport:
    """One game's state after a step: the seats the main process must act for, and what happened."""
    kinds: tuple  # (kind of seat 0, kind of seat 1) for the game now being played
    obs: dict  # seat -> SeatObs, for seats played by a network
    rewards: np.ndarray  # float32 [2 seats, 2]: (win/loss, shaping) reward of the last step
    done: bool  # the last step ended a game (obs and kinds already describe the next one)
    finished: dict | None  # summary of the game that ended


class GameSlot:
    """One game, restarted with a newly drawn opponent whenever it ends."""

    def __init__(self, env_config: EnvConfig, seed: int, replay_dir: str | None = None, replay_every: int = 0,
                 replay_offset: int = 0):
        """replay_dir / replay_every: save a replay of every replay_every-th game this slot plays, starting
        with game replay_offset + 1. Slots get different offsets so replays arrive one at a time from the
        start, not all together after every slot has played replay_every games."""
        self.replay_dir = replay_dir
        self.replay_every = replay_every
        self.replay_offset = replay_offset
        self.games_started = 0
        self.recorder = None
        self.seed = seed
        self.env = DuelEnv(env_config)
        self.rng = np.random.default_rng(seed)
        self.kinds = (LEARNER, LEARNER)
        self.opponent = "self"
        self.bot = None
        self.obs = None
        self.length = 0

    def new_game(self, probs) -> None:
        probs = np.asarray(probs, dtype=np.float64)
        self.opponent = OPPONENTS[int(self.rng.choice(len(OPPONENTS), p=probs / probs.sum()))]
        if self.opponent == "self":
            self.kinds = (LEARNER, LEARNER)
            self.bot = None
        else:
            learner_seat = int(self.rng.integers(2))
            other = PAST if self.opponent == "past" else BOT
            self.kinds = (LEARNER, other) if learner_seat == 0 else (other, LEARNER)
            self.bot = (RushBot() if self.opponent == "rush"
                        else RandomBot(seed=int(self.rng.integers(2 ** 31))) if self.opponent == "random" else None)
        self.obs, _ = self.env.reset(seed=int(self.rng.integers(2 ** 31)))
        self.games_started += 1
        self.recorder = None
        if (self.replay_dir and self.replay_every
                and (self.games_started - 1 - self.replay_offset) % self.replay_every == 0):
            names = PLAYER_NAMES[self.opponent]
            learner_seat = self.kinds.index(LEARNER)
            self.recorder = ReplayRecorder(self.env, names if learner_seat == 0 else names[::-1])
        self.length = 0

    def report(self, rewards=None, done=False, finished=None) -> GameReport:
        obs = {p: SeatObs.from_obs(self.obs[p]) for p in (0, 1) if self.kinds[p] != BOT}
        return GameReport(self.kinds, obs, rewards if rewards is not None else np.zeros((2, 2), np.float32),
                          done, finished)

    def grid_action(self, seat: int, chosen: np.ndarray) -> np.ndarray:
        """Spreads one row per actor ([K, 5], in actor_masks order) onto the GridNet action grid."""
        g = self.env.game
        cells = self.obs[seat]["masks"]["cells"]
        if len(chosen) != len(cells):
            raise ValueError(f"expected {len(cells)} actor rows, got {len(chosen)}")
        action = np.zeros((g.height, g.width, 5), dtype=np.int64)
        if len(cells):
            action[cells[:, 1], cells[:, 0]] = chosen
        return action

    def step(self, chosen: dict, probs) -> GameReport:
        """chosen: seat -> [K, 5] action rows for every seat played by a network."""
        actions = [None, None]
        for p in (0, 1):
            if self.kinds[p] == BOT:
                actions[p] = self.bot.act(self.env, p, self.obs[p])
            else:
                actions[p] = self.grid_action(p, chosen[p])
        obs, _, done, info = self.env.step(actions)
        if self.recorder is not None:
            self.recorder.frame()
        self.length += 1
        parts = info["reward_parts"]
        rewards = np.array([[parts["win"], parts["shaping"]], [-parts["win"], -parts["shaping"]]], dtype=np.float32)
        if not done:
            self.obs = obs
            return self.report(rewards)
        if self.recorder is not None and self.replay_dir:  # (evaluate.py saves its own recordings)
            name = f"seed{self.seed}_game{self.games_started:05d}_{self.opponent}.json.gz"
            finished_replay = str(self.recorder.save(Path(self.replay_dir) / name))
        else:
            finished_replay = None
        finished = {"opponent": self.opponent, "kinds": self.kinds, "winner": info["winner"], "replay": finished_replay,
                    "decisions": self.length, "ticks": info["tick"]}
        self.new_game(probs)
        return self.report(rewards, done=True, finished=finished)


def _env_config() -> EnvConfig:
    return EnvConfig(mask_format="actors")


def _worker(conn, seeds, replay_dir=None, replay_every=0, first_slot=0):
    slots = [GameSlot(_env_config(), s, replay_dir, replay_every, first_slot + i) for i, s in enumerate(seeds)]
    while True:
        message = conn.recv()
        command = message[0]
        if command == "reset":
            probs = message[1]
            for slot in slots:
                slot.new_game(probs)
            conn.send([slot.report() for slot in slots])
        elif command == "step":
            chosen, probs = message[1], message[2]
            conn.send([slot.step(c, probs) for slot, c in zip(slots, chosen)])
        elif command == "close":
            conn.close()
            return


class VecGames:
    """`workers` processes, each running `games_per_worker` games; 0 workers runs them in this process
    (for tests). Games are numbered worker by worker."""

    def __init__(self, workers: int, games_per_worker: int, seed: int, replay_dir: str | None = None,
                 replay_every: int = 0):
        self.n_games = max(1, workers) * games_per_worker
        seeds = [seed * 100_003 + i for i in range(self.n_games)]
        self.per_worker = games_per_worker
        self.local = None
        self.conns, self.procs = [], []
        if workers == 0:
            self.local = [GameSlot(_env_config(), s, replay_dir, replay_every, i) for i, s in enumerate(seeds)]
            return
        ctx = mp.get_context("spawn")  # safe next to CUDA, and the same on every platform
        for w in range(workers):
            parent, child = ctx.Pipe()
            proc = ctx.Process(target=_worker, args=(child, seeds[w * games_per_worker:(w + 1) * games_per_worker],
                                                     replay_dir, replay_every, w * games_per_worker),
                               daemon=True)
            proc.start()
            child.close()
            self.conns.append(parent)
            self.procs.append(proc)

    def reset(self, probs) -> list:
        if self.local is not None:
            for slot in self.local:
                slot.new_game(probs)
            return [slot.report() for slot in self.local]
        for conn in self.conns:
            conn.send(("reset", tuple(probs)))
        return [report for conn in self.conns for report in conn.recv()]

    def step(self, chosen: list, probs) -> list:
        """chosen[g] = {seat: [K, 5] rows} for every seat of game g played by a network."""
        if self.local is not None:
            return [slot.step(c, probs) for slot, c in zip(self.local, chosen)]
        for w, conn in enumerate(self.conns):
            conn.send(("step", chosen[w * self.per_worker:(w + 1) * self.per_worker], tuple(probs)))
        return [report for conn in self.conns for report in conn.recv()]

    def close(self):
        for conn in self.conns:
            try:
                conn.send(("close",))
            except (BrokenPipeError, OSError):
                pass
        for proc in self.procs:
            proc.join(timeout=5)
