"""Rollout storage, advantages, and padding experience into training batches (NumPy only)."""

from __future__ import annotations

import numpy as np

from .games import SeatObs

HEADS = 2  # value heads / reward parts: 0 = win/loss, 1 = shaping


def gae(rewards, values, dones, next_values, gamma, lam):
    """
    Generalised advantage estimates for one reward part.
      rewards, values: [T, S] (S = sequences: game seats)
      dones:          [T, S] True if the game ended with step t (nothing after it is bootstrapped)
      next_values:    [S] value of the state after the last step
    Returns (advantages, returns), both [T, S].
    """
    T = rewards.shape[0]
    adv = np.zeros_like(rewards, dtype=np.float32)
    last = np.zeros(rewards.shape[1], dtype=np.float32)
    for t in range(T - 1, -1, -1):
        following = next_values if t == T - 1 else values[t + 1]
        alive = 1.0 - dones[t].astype(np.float32)
        delta = rewards[t] + gamma * following * alive - values[t]
        last = delta + gamma * lam * alive * last
        adv[t] = last
    return adv, adv + values


class Rollout:
    """
    One rollout of T steps of G games, kept per game seat (S = 2G sequences). For each step and seat:
    whether the learner played it (only those are trained on), its observation and chosen actions,
    their log-probability, the value estimates, and the rewards that followed.
    """

    def __init__(self, steps: int, games: int):
        self.T, self.G = steps, games
        S = 2 * games
        self.learn = np.zeros((steps, S), dtype=bool)
        self.rewards = np.zeros((steps, S, HEADS), dtype=np.float32)
        self.values = np.zeros((steps, S, HEADS), dtype=np.float32)
        self.logprob = np.zeros((steps, S), dtype=np.float32)
        self.dones = np.zeros((steps, S), dtype=bool)
        self.obs = {}  # (t, s) -> SeatObs
        self.actions = {}  # (t, s) -> int [K, 5]

    @staticmethod
    def seq(game: int, seat: int) -> int:
        return 2 * game + seat

    def add(self, t: int, game: int, seat: int, obs: SeatObs, actions: np.ndarray, logprob: float, values):
        s = self.seq(game, seat)
        self.learn[t, s] = True
        self.obs[(t, s)] = obs
        self.actions[(t, s)] = actions
        self.logprob[t, s] = logprob
        self.values[t, s] = values

    def advantages(self, next_values: np.ndarray, gammas, lam: float):
        """next_values [S, HEADS]. Returns advantages and returns, each [T, S, HEADS]."""
        adv = np.zeros_like(self.rewards)
        ret = np.zeros_like(self.rewards)
        for h in range(HEADS):
            adv[..., h], ret[..., h] = gae(self.rewards[..., h], self.values[..., h], self.dones,
                                           next_values[:, h], gammas[h], lam)
        return adv, ret

    def batch(self, adv: np.ndarray, ret: np.ndarray) -> dict:
        """Every learner sample, padded to the largest number of actors: arrays with N rows."""
        keys = [(t, s) for t in range(self.T) for s in range(2 * self.G) if self.learn[t, s]]
        obs = [self.obs[k] for k in keys]
        batch = pad_observations(obs)
        n, k_max = len(keys), batch["cells"].shape[1]
        actions = np.zeros((n, k_max, 5), dtype=np.int64)
        for i, key in enumerate(keys):
            a = self.actions[key]
            actions[i, :len(a)] = a
        idx_t = np.array([t for t, _ in keys], dtype=np.int64)
        idx_s = np.array([s for _, s in keys], dtype=np.int64)
        batch.update(actions=actions, logprob=self.logprob[idx_t, idx_s], adv=adv[idx_t, idx_s], ret=ret[idx_t, idx_s],
                     values=self.values[idx_t, idx_s])
        return batch


def pad_observations(obs: list) -> dict:
    """Stacks SeatObs into arrays, padding the actor rows to the largest K. Padded rows are marked
    invalid and allow only 'noop', so they never contribute."""
    n = len(obs)
    k_max = max(1, max(len(o.cells) for o in obs))
    first = obs[0]
    n_types, n_heads, n_local = first.type.shape[1], first.local.shape[1], first.local.shape[2]
    out = {
        "planes": np.stack([o.planes for o in obs]),
        "globals": np.stack([o.globals for o in obs]),
        "region": np.stack([o.region for o in obs]),
        "cells": np.zeros((n, k_max, 2), dtype=np.int64),
        "valid": np.zeros((n, k_max), dtype=bool),
        "type": np.zeros((n, k_max, n_types), dtype=bool),
        "local": np.zeros((n, k_max, n_heads, n_local), dtype=bool),
        "build_kind": np.zeros((n, k_max, first.build_kind.shape[1]), dtype=bool),
        "train_kind": np.zeros((n, k_max, first.train_kind.shape[1]), dtype=bool),
    }
    out["type"][:, :, 0] = True  # noop for padding rows
    for i, o in enumerate(obs):
        k = len(o.cells)
        if k == 0:
            continue
        out["cells"][i, :k] = o.cells
        out["valid"][i, :k] = True
        out["type"][i, :k] = o.type
        out["local"][i, :k] = o.local
        out["build_kind"][i, :k] = o.build_kind
        out["train_kind"][i, :k] = o.train_kind
    return out
