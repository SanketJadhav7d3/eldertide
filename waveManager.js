import { BALANCE } from './balance.js';

/**
 * Manages the enemy waves, including timing, configuration, and spawning.
 */
export default class WaveManager {
  constructor(scene, enemyArmy) {
    this.scene = scene;
    this.enemyArmy = enemyArmy;
    this.currentWaveIndex = -1;
    this.isWaveInProgress = false;
    this.pendingSpawns = 0; // enemies of the current wave still waiting on their spawn delay
    this.timeUntilNextWave = 0; // in milliseconds
    this.allWavesCompleted = false;

    // Define the spawn points for the enemies.
    this.spawnPoints = [
      { x: 69, y: 13 }, { x: 70, y: 13 }, { x: 65, y: 13 },
      { x: 65, y: 14 }, { x: 63, y: 14 }, { x: 64, y: 15 },
      { x: 61, y: 15 }, { x: 61, y: 35 }, { x: 60, y: 35 },
    ];

    // The waves (composition, spawn tightness and the peace time that precedes each one) are
    // defined in balance.js.
    this.waveConfigs = BALANCE.waves.list.map(wave => ({ ...wave, timeToNextWave: wave.delayBeforeMs }));

    // Start the timer for the first wave.
    this.startNextWaveTimer();
  }

  // Only notifies the UI when the text actually changes (update() runs every frame).
  emitTimerText(text) {
    if (text === this.lastTimerText) return;
    this.lastTimerText = text;
    this.scene.events.emit('waveTimerUpdate', text);
  }

  startNextWaveTimer() {
    this.currentWaveIndex++;
    if (this.currentWaveIndex >= this.waveConfigs.length) {
      console.log("All waves completed!");
      this.emitTimerText('Live peacefully from now on...');
      this.isWaveInProgress = false;
      this.allWavesCompleted = true;
      this.scene.isGameOver = true; // Stops the lose check from firing after a win.
      this.scene.stopAllMusic();
      this.scene.scene.get('UIScene').showEndGameScreen(true);
      return; // Stop further processing
    }

    const currentWave = this.waveConfigs[this.currentWaveIndex];
    this.timeUntilNextWave = currentWave.timeToNextWave;
    this.isWaveInProgress = false;

    // Start the countdown for the very first wave immediately
    if (this.currentWaveIndex === 0) {
        this.timeUntilNextWave = BALANCE.waves.firstWaveDelayMs; // Time to prepare for the first wave.
    }

    console.log(`Timer started for Wave ${this.currentWaveIndex + 1}. Time: ${this.timeUntilNextWave / 1000}s`);
  }

  startWave() {
    if (this.currentWaveIndex >= this.waveConfigs.length) return;

    console.log(`Starting Wave ${this.currentWaveIndex + 1}`);
    this.scene.events.emit('wave-started');
    this.isWaveInProgress = true;
    const waveConfig = this.waveConfigs[this.currentWaveIndex];
    const gaps = BALANCE.waves.spawnGapMs;
    const scale = waveConfig.spawnGapScale;

    // Spawn goblins with a slight delay between each one
    if (waveConfig.goblins) {
      for (let i = 0; i < waveConfig.goblins; i++) {
        this.pendingSpawns++;
        this.scene.time.delayedCall(i * gaps.goblin * scale, () => {
          this.pendingSpawns--;
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnGoblin(spawnPoint.x, spawnPoint.y);
        });
      }
    }

    // Spawn barrels with a slight delay
    if (waveConfig.barrels) {
      for (let i = 0; i < waveConfig.barrels; i++) {
        this.pendingSpawns++;
        this.scene.time.delayedCall(i * gaps.barrel * scale, () => { // Stagger barrel spawn
          this.pendingSpawns--;
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnBarrel(spawnPoint.x, spawnPoint.y);
        });
      }
    }

    // Spawn bombers
    if (waveConfig.bombers) {
      for (let i = 0; i < waveConfig.bombers; i++) {
        this.pendingSpawns++;
        this.scene.time.delayedCall(i * gaps.bomber * scale, () => { // Stagger bomber spawn
          this.pendingSpawns--;
          const spawnPoint = Phaser.Math.RND.pick(this.spawnPoints);
          this.enemyArmy.spawnBomber(spawnPoint.x, spawnPoint.y);
        });
      }
    }
  }

  update(time, delta) {
    // If all waves are done, do nothing.
    if (this.allWavesCompleted || this.scene.isGameOver) {
      return;
    }

    // If the scene is shutting down, stop processing
    if (!this.scene || !this.scene.sys.isActive()) {
        return;
    }

    if (!this.isWaveInProgress) {
      // Countdown timer logic
      this.timeUntilNextWave -= delta;
      const secondsRemaining = Math.max(0, Math.ceil(this.timeUntilNextWave / 1000));
      this.emitTimerText(`Next wave in: ${secondsRemaining}s`);

      if (this.timeUntilNextWave <= 0) {
        this.startWave();
      }
    } else {
      // Check if the current wave is defeated
      const waveConfig = this.waveConfigs[this.currentWaveIndex];
      // Enemies that haven't spawned yet count as part of the wave.
      let waveDefeated = this.pendingSpawns === 0;

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
        this.scene.events.emit('wave-finished');
        this.startNextWaveTimer();
      } else {
        const waveName = this.currentWaveIndex + 1 >= this.waveConfigs.length ? "Final Wave" : `Wave ${this.currentWaveIndex + 1}`;
        this.emitTimerText(`${waveName} in progress...`);
      }
    }
  }
}