"""Replay files (eldertide_rl/replay.py), the ones watched in the browser game's replay viewer."""

import gzip
import json
from pathlib import Path

import pytest

from eldertide_rl import DuelEnv, RushBot
from eldertide_rl.replay import FORMAT, ReplayRecorder, load_replay
from eldertide_rl.train.games import GameSlot, _env_config

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def recorded():
    """A whole RushBot mirror match, recorded."""
    env = DuelEnv()
    obs, _ = env.reset(seed=3)
    recorder = ReplayRecorder(env, ("Left", "Right"))
    bots = [RushBot(), RushBot()]
    done, info = False, None
    while not done:
        obs, _, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
        recorder.frame()
    return env, recorder, info


def test_header_describes_the_game(recorded):
    env, recorder, info = recorded
    recorder.finish()
    d = recorder.data
    assert d["format"] == FORMAT and d["version"] == 1
    assert (REPO / d["map"]).is_file()  # the browser loads the map from this repo-relative path
    assert d["origin"] == list(env.map.origin) and d["size"] == [env.game.width, env.game.height]
    assert d["mirrored"] is True
    assert [p["name"] for p in d["players"]] == ["Left", "Right"]
    assert d["winner"] == info["winner"] and d["ticks"] == info["tick"]
    # The start, then one per decision (the last one cut short when the game ends part-way through it).
    assert len(d["frames"]) == -(-info["tick"] // env.config.decision_ticks) + 1


def test_frames_hold_every_unit_in_map_file_tiles(recorded):
    env, recorder, _ = recorded
    d = recorder.data
    ox, oy = d["origin"]
    w, h = d["size"]
    unit_ids, building_ids = set(), set()
    for f in d["frames"]:
        for uid, kind, owner, x, y, hp, action, target in f["u"]:
            assert ox <= x < ox + w and oy <= y < oy + h
            assert 0 < hp <= 1 and owner in (0, 1) and 0 <= action < len(d["kinds"]["actions"])
            assert 0 <= kind < len(d["kinds"]["units"])
            unit_ids.add(uid)
        for bid, kind, owner, x, y, hp, built, queue in f["b"]:
            assert 0 <= hp <= 1 and 0 <= built <= 1
            building_ids.add(bid)
    # Both castles stand at the start, mirror images of each other.
    castles = [b for b in d["frames"][0]["b"] if d["kinds"]["buildings"][b[1]] == "castle"]
    assert len(castles) == 2
    cw = d["building_sizes"]["castle"][0]
    (_, _, _, x0, y0, *_), (_, _, _, x1, y1, *_) = sorted(castles, key=lambda b: b[2])
    assert y0 == y1 and (x0 - ox) + cw + (x1 - ox) == w
    # Every hit and arrow is between things that were in the game.
    events = [e for f in d["frames"] for e in f["ev"]]
    assert {e[0] for e in events} == {"hit", "arrow"}
    for e in events:
        attacker, target = (e[2], e[3]) if e[0] == "hit" else (e[3], e[4])
        assert attacker in unit_ids | building_ids and target in unit_ids | building_ids
        if e[0] == "arrow":
            assert e[1] < e[2]  # loosed before it lands


def test_resources_appear_and_go(recorded):
    _, recorder, _ = recorded
    d = recorder.data
    ids = {r[0] for r in d["resources"]}
    for f in d["frames"]:
        ids |= {r[0] for r in f["ra"]}
        assert set(f["rr"]) <= ids
    assert any(f["rr"] for f in d["frames"])  # trees get chopped down


@pytest.mark.parametrize("name", ["game.json", "game.json.gz"])
def test_save_and_load(recorded, tmp_path, name):
    _, recorder, _ = recorded
    path = recorder.save(tmp_path / "sub" / name)
    if name.endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            json.load(f)
    assert load_replay(path) == json.loads(json.dumps(recorder.data))


def test_load_rejects_other_json(tmp_path):
    path = tmp_path / "other.json"
    path.write_text('{"layers": []}')
    with pytest.raises(ValueError):
        load_replay(path)


def test_recording_does_not_change_the_game():
    def play(record):
        env = DuelEnv()
        obs, _ = env.reset(seed=11)
        recorder = ReplayRecorder(env) if record else None
        bots = [RushBot(), RushBot()]
        for _ in range(150):
            obs, _, done, info = env.step([bots[p].act(env, p, obs[p]) for p in (0, 1)])
            if recorder:
                recorder.frame()
            if done:
                break
        g = env.game
        return [(u.id, u.x, u.y, u.hp) for u in g.units()], info["tick"]

    assert play(True) == play(False)


def test_training_slots_save_every_nth_game(tmp_path):
    slot = GameSlot(_env_config(), seed=4, replay_dir=str(tmp_path), replay_every=2)
    probs = (0.0, 0.0, 1.0, 0.0)  # against RushBot
    slot.new_game(probs)
    assert slot.recorder is None
    slot.new_game(probs)
    assert slot.recorder is not None
    names = [p["name"] for p in slot.recorder.data["players"]]
    assert sorted(names) == ["Agent", "RushBot"]
    assert names[slot.kinds.index("learner")] == "Agent"
