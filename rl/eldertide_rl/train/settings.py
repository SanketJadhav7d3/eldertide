"""Training settings, with defaults sized for a free Colab runtime (2 CPU cores, a T4, ~12 GB RAM)."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, fields

# Who the learner plays against when a game starts.
OPPONENTS = ("self", "past", "rush", "random")


@dataclass
class TrainSettings:
    run_dir: str = "runs/eldertide"  # checkpoints, opponent pool and metrics.csv (put it on Google Drive)
    seed: int = 1
    total_env_steps: int = 30_000_000  # decisions per game, summed over all games
    # Games: `workers` processes, each running `games_per_worker` games one after another.
    workers: int = 2
    games_per_worker: int = 12  # more games per step: each network call serves more decisions
    rollout_steps: int = 128  # decisions per game between updates
    # PPO.
    learning_rate: float = 2.5e-4
    final_lr_fraction: float = 0.1  # the learning rate falls linearly to this fraction
    epochs: int = 2
    minibatches: int = 16  # ~300 samples each with 24 games
    clip: float = 0.2
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    max_grad_norm: float = 0.5
    gae_lambda: float = 0.95
    gamma_win: float = 0.999  # the win/loss reward arrives only at the end: look far ahead
    # The shaping head must use the reward's own gamma (RewardConfig.gamma) for the shaping to be
    # potential-based; ppo.py checks this.
    gamma_shaping: float = 0.99
    # Shaped advantages count fully at first and fade out by this many env steps (then only the
    # win/loss signal is left), as RAISocketAI did.
    shaping_fade_steps: int = 15_000_000
    # Opponents (probabilities over OPPONENTS). "past" plays a saved earlier version; until the first
    # one is saved its share goes to "self".
    # RushBot gets a large share: it is the organised opponent the learner most needs to learn to beat.
    opponent_probs: tuple = (0.3, 0.3, 0.3, 0.1)
    snapshot_every: int = 40  # updates between saving the current policy into the opponent pool
    pool_size: int = 20
    # Network.
    channels: int = 64
    deep_channels: int = 128
    high_blocks: int = 3
    low_blocks: int = 4
    key_dim: int = 8
    # A new network starts with this bonus on the noop logit of busy units (see model.py): about 90% "keep
    # doing it" for a unit with 7 legal kinds of order. It is learned from there; resumed runs keep theirs.
    busy_noop_bias: float = 4.0
    mixed_precision: bool = True  # 16-bit convolutions on the GPU (the heads stay 32-bit)
    # Saving and logging.
    checkpoint_minutes: float = 10.0
    log_every: int = 1  # updates between metrics.csv rows
    # Each of the game slots saves every replay_every-th game it plays to <run-dir>/replays, the slots
    # taking turns: the first replay arrives after about one game, then with games of ~1500 decisions
    # about one per 40,000 env steps (~50-200 KB each). 0 turns it off.
    replay_every: int = 25
    # Starting from imitation (train/imitate.py): a checkpoint.pt whose network a new run starts from
    # (ignored when the run resumes), and a term that keeps the policy close to the teacher's orders:
    # bc_coef times the labels' negative log-probability, fading to zero over bc_fade_steps env steps.
    init_from: str = ""
    bc_coef: float = 0.0
    bc_fade_steps: int = 4_000_000
    smoke: bool = False  # a tiny run that checks everything works in about a minute

    def apply_smoke(self) -> "TrainSettings":
        if self.smoke:
            self.workers = min(self.workers, 2)
            self.games_per_worker = 1
            self.rollout_steps = 16
            if self.total_env_steps == TrainSettings.total_env_steps:  # not set on the command line
                self.total_env_steps = 3 * self.workers * self.games_per_worker * self.rollout_steps
            self.minibatches = 2
            self.snapshot_every = 1
            self.checkpoint_minutes = 0.0
            self.channels, self.deep_channels, self.high_blocks, self.low_blocks = 16, 32, 1, 1
        return self

    @property
    def games(self) -> int:
        return self.workers * self.games_per_worker

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ImitationSettings:
    """Imitation learning (train/imitate.py): the network learns to give the teacher's orders."""
    run_dir: str = "runs/imitation"
    seed: int = 1
    total_env_steps: int = 3_000_000
    workers: int = 2
    games_per_worker: int = 12
    rollout_steps: int = 64  # decisions per game between updates
    learning_rate: float = 5e-4
    final_lr_fraction: float = 0.1
    epochs: int = 2
    minibatches: int = 8
    value_coef: float = 0.5  # the value heads learn from the same games, so PPO starts with a sensible critic
    max_grad_norm: float = 0.5
    gae_lambda: float = 0.95
    gamma_win: float = 0.999
    gamma_shaping: float = 0.99
    # Opponents over OPPONENTS (self, past, rush, random); "self" games have two learner seats.
    opponent_probs: tuple = (0.4, 0.0, 0.4, 0.2)
    # The share of learner seats the teacher plays (the rest the network plays, with the teacher still
    # labelling every position: DAgger), falling linearly from start to end over teacher_share_steps.
    teacher_share_start: float = 1.0
    teacher_share_end: float = 0.3
    teacher_share_steps: int = 2_000_000
    # Network: keep these equal to TrainSettings', so PPO can start from the result.
    channels: int = 64
    deep_channels: int = 128
    high_blocks: int = 3
    low_blocks: int = 4
    key_dim: int = 8
    busy_noop_bias: float = 4.0
    mixed_precision: bool = True
    checkpoint_minutes: float = 10.0
    replay_every: int = 25
    smoke: bool = False

    def apply_smoke(self) -> "ImitationSettings":
        if self.smoke:
            self.workers = min(self.workers, 2)
            self.games_per_worker = 1
            self.rollout_steps = 16
            if self.total_env_steps == ImitationSettings.total_env_steps:
                self.total_env_steps = 3 * self.workers * self.games_per_worker * self.rollout_steps
            self.minibatches = 2
            self.checkpoint_minutes = 0.0
            self.teacher_share_steps = self.total_env_steps
            self.channels, self.deep_channels, self.high_blocks, self.low_blocks = 16, 32, 1, 1
        return self

    @property
    def games(self) -> int:
        return self.workers * self.games_per_worker

    def to_dict(self) -> dict:
        return asdict(self)


def parse_dataclass(cls, argv=None, description: str = ""):
    """Command-line flags for every field of a settings dataclass (--flag / --no-flag for booleans)."""
    parser = argparse.ArgumentParser(description=description)
    defaults = cls()
    for f in fields(cls):
        value = getattr(defaults, f.name)
        flag = "--" + f.name.replace("_", "-")
        if isinstance(value, bool):  # --flag / --no-flag
            parser.add_argument(flag, action=argparse.BooleanOptionalAction, default=value)
        elif isinstance(value, tuple):
            parser.add_argument(flag, type=float, nargs=len(value), default=value)
        else:
            parser.add_argument(flag, type=type(value), default=value)
    args = parser.parse_args(argv)
    settings = cls(**{f.name: (tuple(v) if isinstance(v, list) else v)
                      for f, v in ((f, getattr(args, f.name)) for f in fields(cls))})
    return settings.apply_smoke()


def parse_settings(argv=None) -> TrainSettings:
    return parse_dataclass(TrainSettings, argv, "Train an Eldertide agent with PPO and self-play.")
