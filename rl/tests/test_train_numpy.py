"""The parts of training that don't need PyTorch: game workers, rollout storage and advantages."""

import numpy as np

from eldertide_rl.bots import sample_masked_action
from eldertide_rl.train.games import BOT, LEARNER, PAST, GameSlot, VecGames, _env_config
from eldertide_rl.train.settings import OPPONENTS, parse_settings
from eldertide_rl.train.storage import Rollout, gae, pad_observations


def legal_rows(obs, rng, act_prob=0.5):
    """Random legal action rows for a SeatObs, one per actor (what the network will produce)."""
    masks = {"cells": obs.cells, "type": obs.type, "local": obs.local, "region": obs.region,
             "build_kind": obs.build_kind, "train_kind": obs.train_kind}
    h, w = obs.planes.shape[:2]
    grid = sample_masked_action(masks, rng, act_prob, shape=(h, w))
    return grid[obs.cells[:, 1], obs.cells[:, 0]] if len(obs.cells) else np.zeros((0, 5), np.int64)


def test_games_play_every_kind_of_opponent():
    rng = np.random.default_rng(0)
    vec = VecGames(workers=0, games_per_worker=8, seed=3)
    probs = (0.25, 0.25, 0.25, 0.25)
    reports = vec.reset(probs)
    seen, finished = set(), []
    for _ in range(300):
        chosen = []
        for rep in reports:
            assert set(rep.obs) == {p for p in (0, 1) if rep.kinds[p] != BOT}
            assert rep.kinds.count(LEARNER) >= 1
            seen.add(tuple(sorted(rep.kinds)))
            chosen.append({p: legal_rows(o, rng) for p, o in rep.obs.items()})
        reports = vec.step(chosen, probs)
        for rep in reports:
            assert np.allclose(rep.rewards[0], -rep.rewards[1])
            if rep.finished:
                finished.append(rep.finished)
    assert seen == {(LEARNER, LEARNER), (LEARNER, PAST), (BOT, LEARNER)}
    # Every order was legal when chosen. The only refusals come from two of a player's orders in the
    # same step competing (e.g. two workers spending the last wood), which per-actor masks can't see.
    refused = sum(slot.env.game.stats[p]["invalid_commands"] for slot in vec.local for p in (0, 1))
    assert refused <= 5
    assert finished and all(f["opponent"] in OPPONENTS for f in finished)


def test_observation_rows_match_the_actors():
    slot = GameSlot(_env_config(), seed=1)
    slot.new_game((1, 0, 0, 0))
    rep = slot.report()
    obs = rep.obs[0]
    g = slot.env.game
    assert obs.planes.dtype == np.uint8 and obs.planes.shape == (g.height, g.width, 35)
    assert len(obs.cells) == len(g.units(0)) + len(g.buildings(0))
    assert obs.local.shape == (len(obs.cells), 8, 225) and obs.region.shape == (36,)
    try:
        slot.step({0: np.zeros((len(obs.cells) + 1, 5), np.int64), 1: np.zeros((len(obs.cells), 5), np.int64)},
                  (1, 0, 0, 0))
    except ValueError:
        pass
    else:
        raise AssertionError("a wrong number of action rows must be refused")


def test_worker_processes_play_the_same_games():
    def run(workers, per_worker):
        vec = VecGames(workers=workers, games_per_worker=per_worker, seed=5)
        probs = (0.4, 0.0, 0.3, 0.3)
        reports = vec.reset(probs)
        trace = []
        for _ in range(40):
            chosen = [{p: np.zeros((len(o.cells), 5), np.int64) for p, o in rep.obs.items()} for rep in reports]
            reports = vec.step(chosen, probs)
            trace.append([(rep.kinds, rep.rewards.round(6).tolist(), rep.done) for rep in reports])
        vec.close()
        return trace

    local = run(0, 4)  # the same four games, in this process or in two worker processes
    workers = run(2, 2)
    assert len(local[0]) == len(workers[0]) == 4
    assert local == workers


def test_gae_by_hand():
    rewards = np.array([[1.0], [0.0], [2.0]], dtype=np.float32)
    values = np.array([[0.5], [0.4], [0.3]], dtype=np.float32)
    dones = np.array([[False], [True], [False]])
    next_values = np.array([0.9], dtype=np.float32)
    gamma, lam = 0.9, 0.8
    adv, ret = gae(rewards, values, dones, next_values, gamma, lam)
    d2 = 2.0 + gamma * 0.9 - 0.3
    d1 = 0.0 - 0.4  # the game ended here: nothing after it counts
    d0 = 1.0 + gamma * 0.4 - 0.5
    expected = np.array([[d0 + gamma * lam * d1], [d1], [d2]], dtype=np.float32)
    assert np.allclose(adv, expected) and np.allclose(ret, expected + values)


def test_rollout_batch_keeps_only_learner_seats():
    vec = VecGames(workers=0, games_per_worker=3, seed=9)
    reports = vec.reset((0.0, 0.0, 1.0, 0.0))  # every game: learner against RushBot
    roll = Rollout(steps=4, games=3)
    for t in range(4):
        chosen = []
        for g, rep in enumerate(reports):
            choice = {}
            for p, o in rep.obs.items():
                rows = np.zeros((len(o.cells), 5), np.int64)
                choice[p] = rows
                roll.add(t, g, p, o, rows, logprob=-1.0 * t, values=(0.1, 0.2))
            chosen.append(choice)
        reports = vec.step(chosen, (0.0, 0.0, 1.0, 0.0))
        for g, rep in enumerate(reports):
            roll.rewards[t, 2 * g:2 * g + 2] = rep.rewards
            roll.dones[t, 2 * g:2 * g + 2] = rep.done
    adv, ret = roll.advantages(np.zeros((6, 2), np.float32), (0.999, 0.99), 0.95)
    batch = roll.batch(adv, ret)
    n = 4 * 3  # one learner seat per game and step
    assert roll.learn.sum() == n and len(batch["logprob"]) == n
    k = batch["cells"].shape[1]
    assert batch["local"].shape == (n, k, 8, 225) and batch["actions"].shape == (n, k, 5)
    padded = ~batch["valid"]
    assert batch["type"][padded][:, 0].all() and not batch["type"][padded][:, 1:].any()


def test_padding_with_no_actors():
    slot = GameSlot(_env_config(), seed=2)
    slot.new_game((1, 0, 0, 0))
    o = slot.report().obs[0]
    empty = type(o)(o.planes, o.globals, o.cells[:0], o.type[:0], o.local[:0], o.build_kind[:0], o.train_kind[:0],
                    o.region)
    batch = pad_observations([empty, o])
    assert batch["cells"].shape[1] == len(o.cells) and not batch["valid"][0].any()


def test_settings_parse_and_smoke():
    s = parse_settings(["--smoke", "--run-dir", "x", "--opponent-probs", "1", "0", "0", "0"])
    assert s.smoke and s.games_per_worker == 1 and s.opponent_probs == (1.0, 0.0, 0.0, 0.0) and s.run_dir == "x"
    defaults = parse_settings([])
    assert defaults.games == 24 and defaults.mixed_precision
    assert not parse_settings(["--no-mixed-precision"]).mixed_precision
