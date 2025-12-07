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

    // Define the spawn points for the enemies.
    this.spawnPoints = [
      { x: 69, y: 13 }, { x: 70, y: 13 }, { x: 65, y: 13 },
      { x: 65, y: 14 }, { x: 63, y: 14 }, { x: 64, y: 15 },
      { x: 61, y: 15 }, { x: 61, y: 35 }, { x: 60, y: 35 },
    ];

    // Define the 5 waves with increasing difficulty.
    this.waveConfigs = [
      { goblins: 3, timeToNextWave: 1300 * 1000 },  // Wave 1: 3 goblins, 60s prep time
      { goblins: 5, timeToNextWave: 75000 },  // Wave 2: 5 goblins, 75s prep time
      { goblins: 8, timeToNextWave: 90000 },  // Wave 3: 8 goblins, 90s prep time
      { goblins: 12, timeToNextWave: 120000 }, // Wave 4: 12 goblins, 120s prep time
      { goblins: 20, timeToNextWave: 0 },      // Wave 5: 20 goblins, final wave
    ];

    // Start the timer for the first wave.
    this.startNextWaveTimer();
  }

  startNextWaveTimer() {
    this.currentWaveIndex++;
    if (this.currentWaveIndex >= this.waveConfigs.length) {
      console.log("All waves completed!");
      this.scene.events.emit('waveTimerUpdate', 'All waves defeated!');
      return;
    }

    const currentWave = this.waveConfigs[this.currentWaveIndex];
    this.timeUntilNextWave = currentWave.timeToNextWave;
    this.isWaveInProgress = false;

    // Start the countdown for the very first wave immediately
    if (this.currentWaveIndex === 0) {
        this.timeUntilNextWave = 30000; // Special shorter timer for the first wave
    }

    console.log(`Timer started for Wave ${this.currentWaveIndex + 1}. Time: ${this.timeUntilNextWave / 1000}s`);
  }

  startWave() {
    if (this.currentWaveIndex >= this.waveConfigs.length) return;

    console.log(`Starting Wave ${this.currentWaveIndex + 1}`);
    this.isWaveInProgress = true;
    const waveConfig = this.waveConfigs[this.currentWaveIndex];

    // Spawn enemies with a slight delay between each one
    for (let i = 0; i < waveConfig.goblins; i++) {
      this.scene.time.delayedCall(i * 500, () => {
        const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
        this.enemyArmy.spawnGoblin(spawnPoint.x, spawnPoint.y);
      });
    }
  }

  update(time, delta) {
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
      if (this.enemyArmy.goblins.countActive(true) === 0) {
        console.log(`Wave ${this.currentWaveIndex + 1} defeated!`);
        this.startNextWaveTimer();
      } else {
        const waveName = this.currentWaveIndex + 1 >= this.waveConfigs.length ? "Final Wave" : `Wave ${this.currentWaveIndex + 1}`;
        this.scene.events.emit('waveTimerUpdate', `${waveName} in progress...`);
      }
    }
  }
}