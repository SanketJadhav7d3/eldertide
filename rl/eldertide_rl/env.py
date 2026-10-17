"""The two-player environment, and a one-player version against a fixed opponent.

    env = DuelEnv()
    obs, info = env.reset(seed=0)            # obs[p] = {"planes", "globals", "masks"}
    obs, rewards, done, info = env.step([action0, action1])

Each player's action is either a GridNet action array [H, W, 5] (see gridnet.py; in that player's
own view) or a list of game Commands (real map coordinates), so scripted bots and other kinds of
policies can use the same environment. Both players act at the same time; whose commands are applied
first is random each step. The game then runs `decision_ticks` ticks.

rewards[1] == -rewards[0] always (zero-sum). `done` is True once a castle has fallen or time ran out
(a draw); the time left is part of the observation, so a time-out is a genuine end of the game.
"""

from __future__ import annotations

import numpy as np

from .config import EnvConfig
from .game import Command, Game
from .gridnet import GridNetInterface
from .mapdata import load_map, mirror_west_half
from .reward import Shaper


class DuelEnv:
    def __init__(self, config: EnvConfig | None = None):
        self.config = config or EnvConfig()
        mapdata = load_map(self.config.map_path)
        self.map = mirror_west_half(mapdata) if self.config.mirror_map else mapdata
        self.game: Game | None = None
        self.interface: GridNetInterface | None = None
        self.shaper: Shaper | None = None
        self._rng = np.random.default_rng()

    @property
    def action_nvec(self) -> np.ndarray:
        """Sizes of the five action components at each cell."""
        return self.interface.action_nvec

    def reset(self, seed: int | None = None):
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        game_seed = int(self._rng.integers(2 ** 31))
        self.game = Game.duel(self.map, self.config.game, seed=game_seed)
        self.interface = GridNetInterface(self.game, ego_view=self.config.ego_view)
        self.shaper = Shaper(self.game, self.config.reward)
        return self._observe(), self._info()

    def step(self, actions):
        if self.game is None:
            raise RuntimeError("call reset() first")
        if self.game.done:
            raise RuntimeError("the game is over; call reset()")
        commands = [self._commands(p, actions[p]) for p in (0, 1)]
        accepted = [0, 0]
        for p in self._rng.permutation(2):
            for cmd in commands[p]:
                accepted[p] += self.game.issue(int(p), cmd)
        for _ in range(self.config.decision_ticks):
            self.game.tick()
            if self.game.done:
                break
        (r0, r1), parts = self.shaper.step()
        info = self._info()
        info["reward_parts"] = parts
        info["commands"] = [len(c) for c in commands]
        info["accepted"] = accepted
        return self._observe(), np.array([r0, r1], dtype=np.float64), self.game.done, info

    def _commands(self, player: int, action) -> list:
        if action is None:
            return []
        if isinstance(action, (list, tuple)) and all(isinstance(c, Command) for c in action):
            return list(action)
        return self.interface.decode(player, action)

    def _observe(self):
        out = []
        for p in (0, 1):
            obs = self.interface.observe(p)
            obs["masks"] = self.interface.masks(p)
            out.append(obs)
        return out

    def _info(self) -> dict:
        g = self.game
        return {"tick": g.tick_count, "winner": g.winner, "stats": [dict(s) for s in g.stats],
                "resources": [dict(r) for r in g.resources]}


class VsBotEnv:
    """One player's view of a duel against a fixed opponent (a bot with `act(env, player)`)."""

    def __init__(self, opponent, side: int = 0, config: EnvConfig | None = None):
        self.env = DuelEnv(config)
        self.opponent = opponent
        self.side = side

    def reset(self, seed: int | None = None):
        obs, info = self.env.reset(seed)
        if hasattr(self.opponent, "reset"):
            self.opponent.reset()
        self._last_obs = obs
        return obs[self.side], info

    def step(self, action):
        other = 1 - self.side
        actions = [None, None]
        actions[self.side] = action
        actions[other] = self.opponent.act(self.env, other, self._last_obs[other])
        obs, rewards, done, info = self.env.step(actions)
        self._last_obs = obs
        return obs[self.side], float(rewards[self.side]), done, info
