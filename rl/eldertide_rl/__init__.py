"""A MicroRTS-style simulator of Eldertide (the Tiny Swords game in this repository) for training agents."""

from .bots import NoopBot, RandomBot, RushBot, sample_masked_action
from .config import EnvConfig, GameConfig, RewardConfig
from .env import DuelEnv, VsBotEnv
from .game import Command, Game
from .gridnet import ACTION_TYPES, GLOBALS, LOCAL_HEADS, PLANES, GridNetInterface
from .mapdata import load_map, mirror_west_half
from .render import render

__all__ = [
    "ACTION_TYPES", "Command", "DuelEnv", "EnvConfig", "GLOBALS", "Game", "GameConfig", "GridNetInterface",
    "LOCAL_HEADS", "NoopBot", "PLANES", "RandomBot", "RewardConfig", "RushBot", "VsBotEnv", "load_map",
    "mirror_west_half", "render", "sample_masked_action",
]
