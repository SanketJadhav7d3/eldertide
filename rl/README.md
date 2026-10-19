# Eldertide RL: a MicroRTS-style simulator

A fast, headless Python version of the browser game for training agents, in the spirit of
[MicroRTS / Gym-μRTS](https://github.com/Farama-Foundation/MicroRTS-Py): two players on a grid, each
with a castle, workers and soldiers, fighting until one castle falls.

It does not run the browser game. It re-implements its rules on a grid, with every number taken from
the game (`balance.js` is parsed directly; building stats are checked against `structureEntity.js`
by the tests).

```
pip install -r requirements.txt
python play.py rush random        # watch two scripted bots play
python -m pytest tests            # 82 tests
```

```python
from eldertide_rl import DuelEnv, RushBot

env = DuelEnv()
obs, info = env.reset(seed=0)
obs, rewards, done, info = env.step([action0, action1])
```

## The game

| | |
|---|---|
| Grid | one cell = one 64 px map tile. The default map (`maps/island_64.tmj`) is 64 × 64 tiles, cropped to the land: 48 × 48 cells |
| Time | one tick = 100 ms; agents decide every 5 ticks (0.5 s), set by `EnvConfig.decision_ticks` |
| Map | the west half is mirrored onto the east half, so both sides are identical; then the open sea around the island is cut away (`EnvConfig.crop_to_land`). `env.map.origin` is where the grid starts on the map file, and `env.map.to_file_cell(x, y)` converts a cell back |
| Start | each side: a castle, 2 workers, a warrior, 2 lancers, 2 archers, 150 wood / 100 meat / 50 gold |
| Win | destroy the enemy castle. Both fall on the same tick, or 15 game-minutes pass: draw |

Rules carried over from the browser game:

- **Economy.** Workers gather where they stand and resources count immediately (no carrying back).
  A tree takes 10 swings for 20 wood. A gold mine holds 1000 gold, 3 per swing. A sheep's first swing
  butchers it, then 4 meat per swing up to 50. Swings come every 0.6 s. A worker on a resource that
  runs out moves to the nearest one of the same kind. Each half keeps up to 6 sheep, regrowing one
  every 30 s.
- **Building.** Workers place houses, towers, barracks and archery ranges, paying up front. Each
  worker next to a site adds 1 point per tick (castle 200, house 80, tower 100, barracks/archery 120).
- **Training.** Castle: workers. Barracks: warriors and lancers. Archery: archers. Up to 5 queued per
  building; cancelling refunds; a destroyed building refunds its queue.
- **Population.** Room for 10, +5 for the castle, +5 per finished house, up to 60. Queued units hold
  their place. If room drops below the units alive, finished units wait ("housed").
- **Combat.** Warrior 12 damage / 0.6 s and lancer 28 / 1.2 s, both hitting any of the 8
  neighbouring cells. Archer 13 / 1.6 s at up to 340 px (5.3 cells). Towers 20 / 1.2 s at units within
  450 px of the tower's centre. A unit starting to attack lands its first hit after a wind-up (warrior
  0.3 s, lancer 0.1 s, archer 0.3 s). Arrows work as in the game: aimed where the target will be,
  flying at 350 px/s, hurting it only if it is within 30 px of the landing spot. The game aims ahead
  only at units moving step by step (chasing, guarding, attack-moving), and not in the last 50 ms of
  each step; units walking a move order or to a job are aimed at where they stand, so they are
  rarely hit while walking.
  Idle soldiers look around once a second and engage enemies within 250 px (3.9 cells), chasing a
  little beyond, preferring units over buildings.
- **Orders.** Move (ignores enemies), attack (chases anywhere), attack-move (fights whatever it
  meets, then carries on), guard (stays by a friendly unit or building, follows it, fights off
  enemies within 5 cells, never strays more than 7), harvest, build, help build, train, cancel.

Simplifications, compared with the browser game:

- At most one unit per cell, and units walk cell to cell (8 directions, no cutting corners) at the
  game's 99.5 px/s: 0.643 s straight, 0.910 s diagonally, in whole ticks with the leftover time
  carried to the next step. A unit leaves its cell as it starts a step, so others can follow it at
  once; it holds (and an agent sees it on) the cell it is walking into.
- Building footprints are whole cells (castle 4×3, barracks and archery 3×3, house and tower 2×2).
- Where in a step a shot is loosed is finer than a tick, so the game's 50 ms no-lead window is
  applied with its probability (using the game's seeded random numbers). Bombs, barrels, goblin
  waves and the monastery are not part of a duel.
- Trees grow on a random 10% of the grass, the same on both halves, and block movement.

**Checked against the real game** (`rl/fidelity/`). `probe.mjs` loads the browser game headlessly
(Edge, through playwright-core), sets up scenarios with the game's own objects and times them on the
game clock; `browser_measurements.json` holds the results and `tests/test_fidelity.py` plays the
same scenarios in the simulator. Covered: walking (7 repeats each way), chopping, mining,
butchering, building with one and two workers, training, each unit's hitting speed, wind-up and
reach, how far units notice enemies, the tower's range, firing rate and arrow flight, a guard
following its ward and fighting off an enemy near it but not one far away, attack-move fighting an
enemy beside its route and carrying on, a 3 x 3 squad walking together, four warriors clearing
four targets, and arrow hit rates against still, walking and chasing targets (0% at a walker on a
long line, ~80% at a chaser, 100% at a still target in both). Amounts and counts match exactly and times within 3-10%. A guard trails its ward by up
to one cell more than in the game, because simulator units move in whole 64 px cells. Not
comparable: battles between two human armies, which the browser game doesn't have.

**Fairness.** Ties are always broken as each player sees the map, so player 1's choices mirror player
0's. Within a tick, units act in a random order that pairs each unit with its mirror image, and all
damage lands at the end of the tick. A test checks that identical bots play exactly mirrored games
until they first fight. Over 60 RushBot mirror matches the score was 32–28.

## Interface

`DuelEnv.step` takes one action per player. Either:

- a **GridNet action array** `[H, W, 5]` (48 × 48 on the default map) in that player's own view (below), or
- a **list of `Command`s** in real map coordinates (what the scripted bots use).

It returns `obs` (one per player), `rewards` (`rewards[1] == -rewards[0]`), `done` and `info`
(winner, per-player stats, which commands were accepted).

### Observation (each player's own view)

With `ego_view` on (the default) player 1 sees the map flipped left-right, so its base is in the
west like player 0's and one policy can play both sides. `obs[p]["planes"]` is `float32 [H, W, 35]`,
one plane per name in `PLANES`:

- terrain: walkable, buildable
- resources: tree, gold mine, sheep, sheep butchered, resource left (fraction)
- owner: own, enemy
- units: worker, warrior, lancer, archer
- buildings: castle, house, tower, barracks, archery; under construction, construction progress
- state: health (fraction), order (7 one-hot planes), moving, moving from, ready to hit (a walking
  unit is shown, and takes orders, on the cell it is walking into)
- production: queue length, training progress, housed
- guarded: one of your soldiers is guarding this

`obs[p]["globals"]` is `float32 [8]`: wood, meat, gold (in thousands), units, queued units and room
(as fractions of 60), enemy units, and the game clock (fraction of 15 minutes).

### Action (GridNet, as in MicroRTS)

One action per cell, read at cells holding one of your units or the top-left cell of one of your
buildings: `[type, local, region, build_kind, train_kind]`.

| Part | Size | Meaning |
|---|---|---|
| type | 11 | noop, stop, move, attack, attack_move, guard, harvest, build, help_build, train, cancel |
| local | 225 | a cell in the 15 × 15 square around the unit: what to attack, guard, harvest or help build, or the top-left cell of the building to place |
| region | 36 | one of the 8 × 8-cell regions (6 × 6 on the default map): where to move or attack-move |
| build_kind | 4 | house, tower, barracks, archery |
| train_kind | 4 | worker, warrior, lancer, archer |

`obs[p]["masks"]` says what is legal right now: `type [H, W, 11]`, `local [H, W, 8, 225]` (one
head per targeted type, with one per building kind for build), `region [36]`, `build_kind
[H, W, 4]`, `train_kind [H, W, 4]`. These dense arrays are about 4 MB per player and almost all
empty, so for training set `EnvConfig(mask_format="actors")`: the same masks as one row per actor
(`cells [K, 2]` plus `type`, `local`, `build_kind`, `train_kind` with K rows; about 30 KB).
`interface.masks(p, actor_masks)` rebuilds the dense form. Sample the type first, then the parts it uses with their
masks; `bots.sample_masked_action` shows how. Anything the masks allow is accepted by the game (a
test plays thousands of random masked orders and checks every one). Illegal orders are ignored and
counted in `info["stats"][p]["invalid_commands"]`.

### Reward (`reward.py`, weights in `RewardConfig`)

```
r_p = 10 * (win +1 / loss -1 / draw 0)  +  (F_p - F_q),     F = gamma * phi(s') - phi(s),   r_q = -r_p
```

`phi` is what a player owns, valued at cost and divided by what a player starts with:

- units: cost × health
- buildings: cost × (⅔ health + ⅓) × construction progress
- queued units: their cost
- unspent resources: × 0.5
- the castle's health: × 2 extra

It is potential-based and zero-sum. Over a whole game the discounted shaping adds up to exactly 0
(tested), so it only moves credit earlier and cannot change who should win. Set `shaping=0` for the
pure win/loss signal, and keep `gamma` equal to your learner's discount.

## Training

`train_colab.ipynb` runs everything on a free Colab runtime (T4 GPU, about 2 CPU cores): it
mounts Google Drive, clones this repository, runs the tests and a one-minute smoke run, then
trains. The same commands work anywhere with PyTorch, from this folder:

```
python -m eldertide_rl.train.ppo --smoke --run-dir /tmp/smoke      # checks everything quickly
python -m eldertide_rl.train.ppo --run-dir <dir>                   # trains; rerun to resume
python -m eldertide_rl.train.evaluate --run-dir <dir> --games 10   # score against the bots
```

- **Algorithm:** PPO with invalid-action masking. An actor's action is scored as its type plus
  only the parts that type uses; a seat's log-probability is the sum over its actors.
- **Network** (`train/model.py`): residual blocks with squeeze-excitation at 48 × 48 plus a
  12 × 12 middle section; heads only at the player's actors, with pointer-style heads for the
  local target and the region. About 2 M parameters.
- **Two value heads** for the win/loss and the shaping reward, each with its own gamma. Their
  advantages are mixed, and the shaping share fades to zero over the first 15 M steps.
- **Opponents:** itself (half the games), saved earlier versions (a pool of 20, refreshed every
  40 updates), RushBot and RandomBot.
- **Saving:** `<run-dir>/checkpoint.pt` every 10 minutes and when stopped. Rerunning resumes
  the network, optimiser, step count and opponent pool. `metrics.csv` gets one row per update.
- Every setting is a flag (`python -m eldertide_rl.train.ppo --help`). The NumPy parts (game
  workers, storage, advantages) are tested in `tests/test_train_numpy.py`; the PyTorch parts are
  exercised by the smoke run.

## Files

| File | |
|---|---|
| `eldertide_rl/config.py` | every number, parsed from `balance.js` or copied from the JS with a test |
| `eldertide_rl/mapdata.py` | reads `.tmj` maps like the game's `mapLoader.js`; mirrors them |
| `eldertide_rl/game.py` | the simulator: state, commands, the tick |
| `eldertide_rl/pathfinding.py` | A* with tick costs |
| `eldertide_rl/gridnet.py` | observations, masks, decoding actions |
| `eldertide_rl/reward.py` | the reward |
| `eldertide_rl/env.py` | `DuelEnv`, and `VsBotEnv` to play one side against a bot |
| `eldertide_rl/bots.py` | `NoopBot`, `RandomBot` (random legal orders), `RushBot` (economy, then attack) |
| `eldertide_rl/render.py` | text picture of the map |
| `eldertide_rl/train/` | training: settings, game workers, storage, network, PPO, evaluation |
| `train_colab.ipynb` | the Colab notebook |

## Speed

About 550-600 decisions per second (roughly 3000 game ticks) on one core, around 2.5x the first
version. Pathfinding is compiled with Numba when it is installed (`requirements.txt`); without it the
same search runs in plain Python and gives identical games, just slower. Masks are built for all of a
player's units at once.

Speed-ups must not change the game: `tests/replay.py` replays four recorded games and compares a
fingerprint of the whole state, the observations and the masks after every decision
(`python tests/replay.py record` re-records them after an intended rule change).
