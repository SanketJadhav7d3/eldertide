/**
 * Manages the enemy waves, including timing, configuration, and spawning.
 */
export default class WaveManager {
  constructor(scene, enemyArmy) {
    this.scene = scene;
    this.enemyArmy = enemyArmy;
    this.currentWaveIndex = -1;
    this.isWaveInProgress = false;
    this.timeUntilNextWave = 0; // in milliseconds
    this.allWavesCompleted = false;

    // Define the spawn points for the enemies.
    this.spawnPoints = [
      { x: 69, y: 13 }, { x: 70, y: 13 }, { x: 65, y: 13 },
      { x: 65, y: 14 }, { x: 63, y: 14 }, { x: 64, y: 15 },
      { x: 61, y: 15 }, { x: 61, y: 35 }, { x: 60, y: 35 },
    ];

    // Define the 5 waves with increasing difficulty. The `timeToNextWave` property
    // represents the "peace time" countdown that begins *before* that wave starts.
    this.waveConfigs = [
      // Wave 1: A small scouting party to introduce combat.
      // The timer for this wave is a special case, set in startNextWaveTimer().
      { goblins: 4, timeToNextWave: 0 },

      // Wave 2: Introduce suicide units. Player must learn to intercept them.
      { goblins: 5, barrels: 2, timeToNextWave: 60000 }, // 60s peace time

      // Wave 3: Introduce ranged units, forcing the player to adapt.
      { goblins: 6, bombers: 3, timeToNextWave: 75000 }, // 75s peace time

      // Wave 4: A combined arms assault requiring more complex strategy.
      { goblins: 10, barrels: 3, bombers: 4, timeToNextWave: 90000 }, // 90s peace time

      // Wave 5: The final siege. A large, challenging but winnable force.
      { goblins: 15, barrels: 5, bombers: 7, timeToNextWave: 120000 }, // 120s peace time
    ];

    // Start the timer for the first wave.
    this.startNextWaveTimer();
  }

  startNextWaveTimer() {
    this.currentWaveIndex++;
    if (this.currentWaveIndex >= this.waveConfigs.length) {
      console.log("All waves completed!");
      this.scene.events.emit('waveTimerUpdate', 'Live peacefully from now on...');
      this.isWaveInProgress = false;
      this.allWavesCompleted = true;
      return; // Stop further processing
    }

    const currentWave = this.waveConfigs[this.currentWaveIndex];
    this.timeUntilNextWave = currentWave.timeToNextWave;
    this.isWaveInProgress = false;

    // Start the countdown for the very first wave immediately
    if (this.currentWaveIndex === 0) {
        this.timeUntilNextWave = 45000; // 45 seconds to prepare for the first wave.
    }

    console.log(`Timer started for Wave ${this.currentWaveIndex + 1}. Time: ${this.timeUntilNextWave / 1000}s`);
  }

  startWave() {
    if (this.currentWaveIndex >= this.waveConfigs.length) return;

    console.log(`Starting Wave ${this.currentWaveIndex + 1}`);
    this.isWaveInProgress = true;
    const waveConfig = this.waveConfigs[this.currentWaveIndex];

    // Spawn goblins with a slight delay between each one
    if (waveConfig.goblins) {
      for (let i = 0; i < waveConfig.goblins; i++) {
        this.scene.time.delayedCall(i * 500, () => {
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnGoblin(spawnPoint.x, spawnPoint.y);
        });
      }
    }

    // Spawn barrels with a slight delay
    if (waveConfig.barrels) {
      for (let i = 0; i < waveConfig.barrels; i++) {
        this.scene.time.delayedCall(i * 1500, () => { // Stagger barrel spawn
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnBarrel(spawnPoint.x, spawnPoint.y);
        });
      }
    }

    // Spawn bombers
    if (waveConfig.bombers) {
      for (let i = 0; i < waveConfig.bombers; i++) {
        this.scene.time.delayedCall(i * 1000, () => { // Stagger bomber spawn
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnBomber(spawnPoint.x, spawnPoint.y);
        });
      }
    }
  }

  update(time, delta) {
    // If all waves are done, do nothing.
    if (this.allWavesCompleted) {
      return;
    }

    if (!this.isWaveInProgress) {
      // Countdown timer logic
      this.timeUntilNextWave -= delta;
      const secondsRemaining = Math.max(0, Math.ceil(this.timeUntilNextWave / 1000));
      this.scene.events.emit('waveTimerUpdate', `Next wave in: ${secondsRemaining}s`);

      if (this.timeUntilNextWave <= 0) {
        this.startWave();
      }
    } else {
      // Check if the current wave is defeated
      const waveConfig = this.waveConfigs[this.currentWaveIndex];
      let waveDefeated = true;

      if (waveConfig.goblins && this.enemyArmy.goblins.getLength() > 0) {
        waveDefeated = false;
      }
      if (waveConfig.barrels && this.enemyArmy.barrels.getLength() > 0) {
        waveDefeated = false;
      }
      if (waveConfig.bombers && this.enemyArmy.bombers.getLength() > 0) {
        waveDefeated = false;
      }

      if (waveDefeated) {
        console.log(`Wave ${this.currentWaveIndex + 1} defeated!`);
        this.startNextWaveTimer();
      } else {
        const waveName = this.currentWaveIndex + 1 >= this.waveConfigs.length ? "Final Wave" : `Wave ${this.currentWaveIndex + 1}`;
        this.scene.events.emit('waveTimerUpdate', `${waveName} in progress...`);
      }
    }
  }
}