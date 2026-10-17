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
python -m pytest tests            # 40 tests
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
| Grid | one cell = one 64 px map tile; the default map (`maps/island_64.tmj`) is 64 × 64 cells |
| Time | one tick = 100 ms; agents decide every 5 ticks (0.5 s), set by `EnvConfig.decision_ticks` |
| Map | the west half is mirrored onto the east half, so both sides are identical |
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
- **Combat.** Warrior 12 damage / 0.6 s (reaches only orthogonal neighbours). Lancer 28 / 1.2 s
  (reaches diagonals). Archer 13 / 1.7 s at up to 5.6 cells. Towers 20 / 1.2 s at 7 cells, at units
  only. Idle soldiers engage enemies within sight (about 4 cells) and chase a little beyond it,
  preferring units over buildings.
- **Orders.** Move (ignores enemies), attack (chases anywhere), attack-move (fights whatever it
  meets, then carries on), guard (stays by a friendly unit or building, follows it, fights off
  enemies within 5 cells, never strays more than 7), harvest, build, help build, train, cancel.

Simplifications, compared with the browser game:

- At most one unit per cell, and units walk cell to cell (8 directions, 0.6 s straight, 0.9 s
  diagonal, no cutting corners).
- Building footprints are whole cells (castle 4×3, barracks and archery 3×3, house and tower 2×2).
- Hits land instantly instead of on an animation frame or when a projectile arrives. Bombs, barrels,
  goblin waves and the monastery are not part of a duel.
- Trees grow on a random 10% of the grass, the same on both halves, and block movement.

**Fairness.** Ties are always broken as each player sees the map, so player 1's choices mirror player
0's. Within a tick, units act in a random order that pairs each unit with its mirror image, and all
damage lands at the end of the tick. A test checks that identical bots play exactly mirrored games
until they first fight. Over 60 RushBot mirror matches the score was 32–28.

## Interface

`DuelEnv.step` takes one action per player. Either:

- a **GridNet action array** `[64, 64, 5]` in that player's own view (below), or
- a **list of `Command`s** in real map coordinates (what the scripted bots use).

It returns `obs` (one per player), `rewards` (`rewards[1] == -rewards[0]`), `done` and `info`
(winner, per-player stats, which commands were accepted).

### Observation (each player's own view)

With `ego_view` on (the default) player 1 sees the map flipped left-right, so its base is in the
west like player 0's and one policy can play both sides. `obs[p]["planes"]` is `float32 [64, 64, 35]`,
one plane per name in `PLANES`:

- terrain: walkable, buildable
- resources: tree, gold mine, sheep, sheep butchered, resource left (fraction)
- owner: own, enemy
- units: worker, warrior, lancer, archer
- buildings: castle, house, tower, barracks, archery; under construction, construction progress
- state: health (fraction), order (7 one-hot planes), moving, moving into, ready to hit
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
| region | 64 | one of the 8 × 8-cell regions: where to move or attack-move |
| build_kind | 4 | house, tower, barracks, archery |
| train_kind | 4 | worker, warrior, lancer, archer |

`obs[p]["masks"]` says what is legal right now: `type [64, 64, 11]`, `local [64, 64, 8, 225]` (one
head per targeted type, with one per building kind for build), `region [64]`, `build_kind
[64, 64, 4]`, `train_kind [64, 64, 4]`. Sample the type first, then the parts it uses with their
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

## Speed

Plain Python and NumPy: about 200 decisions (1000 game ticks) per second on one core. Most of the
time goes to pathfinding and building the masks; those are the places to speed up (or run many
environments in parallel processes) before large-scale training.
