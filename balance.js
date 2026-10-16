/**
 * Every number that affects game balance lives here, so the game can be tuned in one place.
 *
 * How these values were chosen (see the research notes in the commit message):
 *  - Every unit has one clear role and one clear weakness (counters), and "time to kill" is kept
 *    long enough that fights last several seconds instead of being decided by a single hit.
 *  - A fixed income per worker, with unit costs set so that a decent player can afford an army about
 *    as strong as the next wave plus a small margin (the player should "almost afford" each wave).
 *  - Difficulty is a spike-then-breather curve: wave 3 introduces bombers, wave 5 is the final siege.
 *  - Values were checked with a small fight/economy simulator (units walk at 100 px/s, like the game).
 *
 * Timing notes for the animations (10 FPS): worker swing cycle 0.6 s, warrior slash cycle 1.2 s
 * with two hit frames, goblin attack cycle 0.6 s, lancer thrust cycle 0.3 s.
 */
export const BALANCE = {
  // What the player starts the game with.
  start: { wood: 150, meat: 100, gold: 50 },

  economy: {
    // Resources gained per worker swing (a swing takes 0.6 s).
    woodPerSwing: 2,
    goldPerSwing: 3,
    meatPerSwing: 4,
    // Sheep are the only source of meat.
    sheepMax: 12,
    sheepRespawnMs: 30000,
  },

  units: {
    worker: { health: 30, cost: { meat: 30 }, trainMs: 5000 },

    // Frontline: tough and cheap to field; hits twice per slash cycle (every 0.6 s).
    warrior: {
      health: 120,
      damage: 12,
      attackIntervalMs: 600,
      cost: { meat: 45, gold: 10 },
      trainMs: 5000,
    },

    // Reach and burst: strikes first and hard, but slower and more fragile than a warrior.
    lancer: {
      health: 80,
      damage: 28,
      attackIntervalMs: 1200,
      cost: { meat: 50, gold: 25 },
      trainMs: 8000,
    },

    // Ranged damage: out-ranges bombers (340 vs 300 px) but dies fast once enemies reach it.
    archer: {
      health: 45,
      damage: 13,
      cooldownMs: 1300, // time between releasing an arrow and starting the next shot (+0.4 s wind-up)
      sightBoxPx: 680, // side of the square sight/attack box; ~340 px reach
      cost: { wood: 35, meat: 35, gold: 15 },
      trainMs: 6000,
    },

    // Enemies.
    goblin: { health: 60, damage: 7, attackIntervalMs: 600 },
    bomber: { health: 50, damage: 14, cooldownMs: 2600 },
    barrel: { health: 85, explosionDamage: 55 },
  },

  buildings: {
    castleHealth: 2500,
    // A built tower shoots the most threatening enemy in range.
    tower: { range: 450, damage: 20, cooldownMs: 1200 },
  },

  waves: {
    firstWaveDelayMs: 90000,
    // Base gaps between spawns of each type; a wave's spawnGapScale multiplies them
    // (smaller = the wave arrives as a tighter crowd).
    spawnGapMs: { goblin: 500, barrel: 1500, bomber: 1000 },
    list: [
      // 1: a small scouting party.
      { goblins: 5, barrels: 0, bombers: 0, delayBeforeMs: 0, spawnGapScale: 1.0 },
      // 2: first barrels; players must learn to intercept them.
      { goblins: 9, barrels: 2, bombers: 0, delayBeforeMs: 75000, spawnGapScale: 0.6 },
      // 3: bombers appear (the first spike). Archers and towers out-range them.
      { goblins: 12, barrels: 0, bombers: 5, delayBeforeMs: 95000, spawnGapScale: 0.4 },
      // 4: combined arms.
      { goblins: 22, barrels: 7, bombers: 10, delayBeforeMs: 115000, spawnGapScale: 0.25 },
      // 5: the final siege, arriving as one big crowd.
      { goblins: 38, barrels: 14, bombers: 20, delayBeforeMs: 140000, spawnGapScale: 0.12 },
    ],
  },
};
