"""The environment: views, masks, action decoding, rewards and full games."""

import numpy as np
import pytest

from eldertide_rl import DuelEnv, EnvConfig, NoopBot, RandomBot, RewardConfig, RushBot, VsBotEnv
from eldertide_rl.gridnet import A, ACTION_TYPES, GLOBALS, HEAD, LOCAL_HEADS, N_LOCAL, PLANES, local_offset
from eldertide_rl.game import Resource


def without_sheep(env):
    """Sheep are placed at random on each half; take them away to compare the two halves."""
    for r in [e for e in env.game.entities.values() if isinstance(e, Resource) and e.kind == "sheep"]:
        env.game._remove(r)
    return env._observe()


def test_shapes():
    env = DuelEnv()
    obs, info = env.reset(seed=0)
    h, w = env.game.height, env.game.width
    for o in obs:
        assert o["planes"].shape == (h, w, len(PLANES)) and o["planes"].dtype == np.float32
        assert o["globals"].shape == (len(GLOBALS),)
        m = o["masks"]
        assert m["type"].shape == (h, w, len(ACTION_TYPES))
        assert m["local"].shape == (h, w, len(LOCAL_HEADS), N_LOCAL)
        assert m["region"].shape == (env.interface.n_regions,)
        assert m["type"][:, :, A["noop"]].all()
    assert (w, h) == (48, 48)  # the 64 x 64 island with the open sea cropped away
    assert list(env.action_nvec) == [len(ACTION_TYPES), N_LOCAL, 36, 4, 4]  # 6 x 6 regions of 8 x 8 cells


def test_both_players_see_the_same_start():
    env = DuelEnv()
    env.reset(seed=1)
    obs = without_sheep(env)
    a, b = obs
    for i, name in enumerate(PLANES):
        assert np.array_equal(a["planes"][..., i], b["planes"][..., i]), name
    assert np.array_equal(a["globals"], b["globals"])
    for key in ("type", "local", "region", "build_kind", "train_kind"):
        assert np.array_equal(a["masks"][key], b["masks"][key]), key
    # Each player's own castle is on the west of its view.
    own = a["planes"][..., PLANES.index("own")] * a["planes"][..., PLANES.index("building_castle")]
    assert np.nonzero(own)[1].max() < env.game.width / 2


def test_the_same_action_does_the_mirrored_thing():
    env = DuelEnv()
    env.reset(seed=2)
    obs = without_sheep(env)
    masks = obs[0]["masks"]
    action = np.zeros((env.game.height, env.game.width, 5), dtype=np.int64)

    # A worker places a house at its first legal spot.
    workers = np.argwhere(masks["build_kind"][:, :, 0])
    ey, ex = workers[0]
    spot = int(np.flatnonzero(masks["local"][ey, ex, HEAD["build_house"]])[0])
    action[ey, ex] = [A["build"], spot, 0, 0, 0]
    # A soldier walks to a (legal) region in the south-west.
    fighters = np.argwhere(masks["type"][:, :, A["attack_move"]])
    sy, sx = fighters[0]
    region = 4 * env.interface.rw + 1
    assert masks["region"][region]
    action[sy, sx] = [A["move"], 0, region, 0, 0]

    obs, rewards, done, info = env.step([action, action.copy()])
    assert info["accepted"] == [2, 2]
    houses = [b for b in env.game.buildings() if b.kind == "house"]
    assert len(houses) == 2
    h0, h1 = sorted(houses, key=lambda b: b.owner)
    dx, dy = local_offset(spot)
    assert (h0.x, h0.y) == (ex + dx, ey + dy)
    assert (h1.x, h1.y) == (env.game.width - h0.x - h0.w, h0.y)

    for _ in range(30):
        env.step([[], []])
    w = env.game.width
    p0 = sorted((u.kind, w - 1 - u.x, u.y) for u in env.game.units(0))
    p1 = sorted((u.kind, u.x, u.y) for u in env.game.units(1))
    assert p0 == p1
    assert np.array_equal(env._observe()[0]["planes"], env._observe()[1]["planes"])


def test_masked_actions_are_always_accepted():
    env = DuelEnv()
    obs, _ = env.reset(seed=3)
    bots = [RandomBot(seed=10, act_prob=0.5), RandomBot(seed=11, act_prob=0.5)]
    sent = [0, 0]
    for _ in range(250):
        obs, rewards, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        assert info["accepted"] == info["commands"], info
        assert rewards[0] == -rewards[1]
        sent = [s + c for s, c in zip(sent, info["commands"])]
        if done:
            break
    assert min(sent) > 500  # plenty of orders of every kind were exercised
    for p in (0, 1):
        assert info["stats"][p]["invalid_commands"] == 0


def test_illegal_actions_do_nothing():
    env = DuelEnv()
    obs, _ = env.reset(seed=4)
    rng = np.random.default_rng(0)
    nvec = env.action_nvec
    for _ in range(20):
        action = np.stack([rng.integers(n, size=(env.game.height, env.game.width)) for n in nvec], axis=-1)
        env.step([action, None])  # unmasked garbage: rejected orders are counted, nothing breaks
    assert env.game.stats[0]["invalid_commands"] > 0


def play(env, bots, seed):
    obs, _ = env.reset(seed=seed)
    gamma = env.config.reward.gamma
    discounted, total, t, done = 0.0, 0.0, 0, False
    while not done:
        obs, rewards, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        assert rewards[1] == -rewards[0]
        discounted += gamma ** t * rewards[0]
        total += rewards[0]
        t += 1
    return info, discounted, total


def test_shaping_adds_up_to_nothing_over_a_game():
    env = DuelEnv(EnvConfig(reward=RewardConfig(win=0.0)))
    info, discounted, total = play(env, [RushBot(), NoopBot()], seed=5)
    assert info["winner"] == 0
    assert abs(discounted) < 1e-9  # potential-based: sum of gamma^t * shaping = phi_0(start) - phi_1(start) = 0
    assert total != 0  # but the undiscounted rewards along the way did carry signal


@pytest.mark.parametrize("rush_side", [0, 1])
def test_rush_bot_wins_from_either_side(rush_side):
    env = DuelEnv()
    bots = [None, None]
    bots[rush_side] = RushBot()
    bots[1 - rush_side] = RandomBot(seed=7)
    info, discounted, total = play(env, bots, seed=6)
    assert info["winner"] == rush_side
    assert info["tick"] < env.config.game.max_ticks
    sign = 1 if rush_side == 0 else -1
    assert sign * total > 0  # the winner's return is positive


def test_vs_bot_env():
    env = VsBotEnv(NoopBot(), side=1)
    obs, info = env.reset(seed=0)
    assert set(obs) == {"planes", "globals", "masks"}
    g = env.env.game
    obs, reward, done, info = env.step(np.zeros((g.height, g.width, 5), dtype=np.int64))
    assert isinstance(reward, float) and not done


@pytest.mark.parametrize("seed", [0, 3])
def test_mirror_play_stays_mirrored_until_the_first_blow(seed):
    """Neither side has an edge: the same strategy on both sides gives exactly mirrored games (tie
    breaks, acting order, sheep) until the armies fight, where coin flips decide who acts first."""
    env = DuelEnv()
    obs, _ = env.reset(seed=seed)
    bots = [RushBot(), RushBot()]
    g, w = env.game, env.game.width
    for _ in range(400):
        obs, rewards, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        if g.stats[0]["damage_dealt"] or g.stats[1]["damage_dealt"]:
            break
        assert sorted((u.kind, w - 1 - u.x, u.y, u.hp, u.order) for u in g.units(0)) == \
            sorted((u.kind, u.x, u.y, u.hp, u.order) for u in g.units(1))
        assert sorted((b.kind, w - b.x - b.w, b.y, b.progress) for b in g.buildings(0)) == \
            sorted((b.kind, b.x, b.y, b.progress) for b in g.buildings(1))
        assert g.resources[0] == g.resources[1] and rewards[0] == 0
    assert g.tick_count > 500  # the bases built up for a good while before fighting
