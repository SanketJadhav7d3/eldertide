"""Imitation learning's NumPy side: translating a bot's orders into the agent's actions (imitation.py)
and the game slots that label positions with them (train/games.py)."""

from collections import Counter

import numpy as np
import pytest

from eldertide_rl import DuelEnv, RushBot
from eldertide_rl.bots import local_head
from eldertide_rl.config import EnvConfig
from eldertide_rl.gridnet import A, ACTION_TYPES
from eldertide_rl.imitation import (BY_REGION, DROPPED, EXACT, TeacherRushBot, TranslatedBot, actor_masks_of,
                                    encode_commands, rows_to_grid)
from eldertide_rl.train.games import LEARNER, GameSlot, VecGames, _env_config
from eldertide_rl.train.storage import Rollout


def assert_legal(rows, masks):
    """Every used part of every row is allowed by the masks (else its log-probability is -inf)."""
    for j, (t, loc, region, build, train) in enumerate(rows):
        assert masks["type"][j, t], ACTION_TYPES[t]
        name = ACTION_TYPES[t]
        if name in ("move", "attack_move"):
            assert masks["region"][region]
        if name == "build":
            assert masks["build_kind"][j, build]
        if name == "train":
            assert masks["train_kind"][j, train]
        head = local_head(t, build)
        if head is not None:
            assert masks["local"][j, head, loc], name


def teacher_game(seed, steps=None):
    """Yields (env, player, commands, masks, rows, obs) at every decision of a teacher mirror match."""
    env = DuelEnv(EnvConfig(mask_format="actors"))
    obs, _ = env.reset(seed=seed)
    bots = [TeacherRushBot(), TeacherRushBot()]
    done, n = False, 0
    while not done and (steps is None or n < steps):
        commands = [bots[p].act(env, p, obs[p]) for p in (0, 1)]
        for p in (0, 1):
            masks = actor_masks_of(env, p, obs[p])
            yield env, p, commands[p], masks, encode_commands(env, p, commands[p], masks)
        obs, _, done, _ = env.step(commands)
        n += 1


def test_labels_are_legal_and_exact_ones_decode_to_the_same_order():
    checked = Counter()
    games = (teacher_game(seed) for seed in (5, 6, 7))
    for env, p, commands, masks, rows in (step for game in games for step in game):
        assert_legal(rows, masks)
        decoded = {c.actor: c for c in env.interface.decode(p, rows_to_grid(env, masks, rows))}
        for c in commands:
            d = decoded.get(c.actor)
            if d is None or d.kind != c.kind:
                continue  # sent to a region first (or a duplicate order for the same actor)
            if c.kind in ("harvest", "help_build", "attack", "guard"):
                assert d.target == c.target
            elif c.kind == "build":
                assert (d.x, d.y, d.what) == (c.x, c.y, c.what)
            elif c.kind == "train":
                assert d.what == c.what
            checked[(p, c.kind)] += 1
    for p in (0, 1):  # both seats (player 1 sees the map mirrored)
        for kind in ("train", "harvest", "build", "attack_move"):
            assert checked[(p, kind)] > 0, (p, kind)


def test_the_teacher_is_almost_always_expressible():
    counts = Counter()
    bot = TranslatedBot(TeacherRushBot())
    env = DuelEnv(EnvConfig(mask_format="actors"))
    obs, _ = env.reset(seed=7)
    opponent, done = RushBot(), False
    while not done:
        obs, _, done, _ = env.step([bot.act(env, 0, obs[0]), opponent.act(env, 1, obs[1])])
    counts = bot.counts
    total = sum(counts.values())
    assert counts[DROPPED] <= 0.02 * total, counts
    assert counts[EXACT] >= 0.5 * total, counts
    assert counts[EXACT] + counts[BY_REGION] + counts[DROPPED] == total


def test_noop_for_actors_without_orders():
    for env, p, commands, masks, rows in teacher_game(seed=3, steps=40):
        ordered = {c.actor for c in commands}
        ids = [u.id for u in env.game.units(p)] + [b.id for b in env.game.buildings(p)]
        for j, entity_id in enumerate(ids):
            if entity_id not in ordered:
                assert rows[j, 0] == A["noop"]


@pytest.mark.parametrize("share, driven", [(1.0, True), (0.0, False)])
def test_slots_label_learner_seats_and_let_the_teacher_play(share, driven):
    slot = GameSlot(_env_config(), seed=2, imitation=True)
    slot.new_game((0.0, 0.0, 1.0, 0.0), teacher_share=share)  # against RushBot
    report = slot.report()
    seat = report.kinds.index(LEARNER)
    assert set(report.labels) == {seat}
    assert report.driven[seat] is driven and report.driven[1 - seat] is False
    labels = report.labels[seat]
    assert labels.shape == (len(report.obs[seat].cells), 5)
    # The network's rows are ignored for a seat the teacher plays: zeros (all noop) change nothing.
    for _ in range(5):
        report = slot.step({seat: np.zeros((len(report.obs[seat].cells), 5), np.int64)}, (0.0, 0.0, 1.0, 0.0), share)
    assert report.labels[seat].shape[0] == len(report.obs[seat].cells)


def test_a_slot_played_by_the_teacher_plays_like_the_translated_teacher():
    """A teacher-driven seat makes exactly the moves TranslatedBot(TeacherRushBot()) would."""
    slot = GameSlot(_env_config(), seed=11, imitation=True)
    slot.new_game((0.0, 0.0, 1.0, 0.0), teacher_share=1.0)
    seat = slot.kinds.index(LEARNER)
    translated = TranslatedBot(TeacherRushBot())
    report = slot.report()
    for _ in range(60):
        expected = translated.act(slot.env, seat, slot.obs[seat])
        assert np.array_equal(slot.grid_action(seat, report.labels[seat]), expected)
        report = slot.step({}, (0.0, 0.0, 1.0, 0.0), 1.0)
        if report.done:
            break


def test_labels_reach_the_training_batch():
    vec = VecGames(workers=0, games_per_worker=2, seed=4, imitation=True)
    probs = (1.0, 0.0, 0.0, 0.0)  # self-play: both seats are learner seats
    reports = vec.reset(probs, teacher_share=0.5)
    rollout = Rollout(3, 2)
    for t in range(3):
        chosen = [{p: np.zeros((len(r.obs[p].cells), 5), np.int64) for p in r.obs} for r in reports]
        for g, r in enumerate(reports):
            for p in r.obs:
                rollout.add(t, g, p, r.obs[p], chosen[g][p], 0.0, np.zeros(2), r.labels[p])
        reports = vec.step(chosen, probs, 0.5)
    adv = np.zeros((3, 4, 2), np.float32)
    batch = rollout.batch(adv, adv)
    assert batch["labels"].shape == batch["actions"].shape
    assert (batch["labels"][..., 0] != 0).any()  # the teacher gave real orders
