
import VillageScene from './villageScene.js';
import StartScene from './scenes/startScene.js';
import LoadingScene from './scenes/LoadingScene.js';
import UIScene from './scenes/uiScene.js';
import AnimatedTiles from './plugins/animatedTilesPlugin.js';

var config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },  
  scene: [StartScene, LoadingScene, VillageScene, UIScene] ,
  plugins: {
    scene: [
      { key: 'AnimatedTiles', plugin: AnimatedTiles, mapping: 'animatedTiles' }
    ]
  }
};


window.game = new Phaser.Game(config);

window.addEventListener('keydown', function(event) {
  // 'R' key to pause/resume the VillageScene for debugging
  if (event.key === 'r' || event.key === 'R') {
    let gameScene = window.game.scene.getScene('VillageScene');
    let uiScene = window.game.scene.getScene('UIScene');
    if (gameScene.sys.isPaused()) {
      gameScene.sys.resume();
      if (uiScene && uiScene.pauseOverlay) uiScene.pauseOverlay.setVisible(false);
    } else {
      gameScene.sys.pause();
      if (uiScene && uiScene.pauseOverlay) uiScene.pauseOverlay.setVisible(true);
    }
  }

  // 'F' key to arrange selected units into a defensive formation
  if (event.key === 'f' || event.key === 'F') {
    let gameScene = window.game.scene.getScene('VillageScene');
    if (gameScene && gameScene.selectedUnits && gameScene.selectedUnits.getLength() > 0) {
      const pointer = gameScene.input.activePointer;
      const worldPoint = gameScene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const selected = gameScene.selectedUnits.getChildren();
      gameScene.playerArmy.setDefensiveFormation(selected, worldPoint.x, worldPoint.y);
    }
  }
});
