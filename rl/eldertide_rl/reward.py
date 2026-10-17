"""The reward: win/loss, plus zero-sum, potential-based shaping on material.

For player p with opponent q, over one decision step s -> s':

    r_p = win * outcome_p  +  shaping * (F_p - F_q),      F = gamma * phi(s') - phi(s)

and r_q = -r_p. The potential phi measures what a player owns, valued at what it cost (divided by
what a player starts with, so it is around 1):

    units                 cost * health fraction
    buildings             cost * (2/3 * health fraction + 1/3) * construction progress
    units in training     cost (already paid; refunded if cancelled)
    unspent resources     banked * amount
    castle                + castle * health fraction (the win condition)

phi is 0 once the game is over, so over a whole game the discounted shaping adds up to
-(phi_p(start) - phi_q(start)) = 0 on a mirrored start: it only moves credit earlier in time and
cannot change which player should win (potential-based shaping; Ng et al. 1999, Devlin & Kudenko 2011).
"""

from __future__ import annotations

from .config import RewardConfig
from .game import Game


def material(game: Game, player: int, banked: float) -> float:
    """What a player owns, in resources (before normalising), without the castle bonus."""
    cfg = game.cfg
    total = 0.0
    for e in game.units(player):
        total += cfg.unit_value(e.kind) * e.hp / e.max_hp
    for b in game.buildings(player):
        built = b.progress / b.build_points
        total += cfg.building_value(b.kind) * (2 / 3 * b.hp / b.max_hp + 1 / 3) * built
        total += sum(cfg.unit_value(kind) for kind in b.queue)
    total += banked * sum(game.resources[player].values())
    return total


class Shaper:
    """Computes the per-step rewards for both players of one game."""

    def __init__(self, game: Game, config: RewardConfig):
        self.game = game
        self.cfg = config
        # Normalise by what a player starts with (the same for both on a mirrored start).
        self.scale = max(1.0, material(game, 0, config.banked))
        self.last = [self.potential(0), self.potential(1)]

    def potential(self, player: int) -> float:
        if self.game.done:
            return 0.0
        phi = material(self.game, player, self.cfg.banked) / self.scale
        castle = self.game.castle(player)
        if castle is not None:
            phi += self.cfg.castle * castle.hp / castle.max_hp
        return phi

    def step(self) -> tuple:
        """Rewards for (player 0, player 1) since the previous call, and their parts for logging."""
        now = [self.potential(0), self.potential(1)]
        f = [self.cfg.gamma * now[p] - self.last[p] for p in (0, 1)]
        self.last = now
        shaped = self.cfg.shaping * (f[0] - f[1])
        outcome = 0.0
        if self.game.done and self.game.winner in (0, 1):
            outcome = 1.0 if self.game.winner == 0 else -1.0
        r0 = self.cfg.win * outcome + shaped
        parts = {"win": self.cfg.win * outcome, "shaping": shaped, "potential": now}
        return (r0, -r0), parts
