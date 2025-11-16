
/*
Interactive objects - Warriors, Towers, Castle and Goblins for now

Game logic class handles all the interaction between them
*/

// mouse controller

export default class GameLogic {

  constructor(scene, castle, towers, playerArmy, enemyArmy) {
    this.scene = scene;
    this.castle = castle;
    this.towers = towers;
    this.playerArmy = playerArmy;
    this.enemyArmy = enemyArmy;

    // GameLogic now manages the group of entities playing their death animation.
    this.scene.dyingEntities = this.scene.add.group();

    //var towersArray = this.towers.towersGroup.getChildren();

    //this.towers.handleOverlapWithGroup(this.playerArmy.warriors);
    //this.towers.handleOverlapWithGroup(this.enemyArmy.goblins);

    // this.enemyArmy.handleGoblinAttackOverlapWithGroup(this.playerArmy.warriors);
    // this.playerArmy.handleWarriorAttackOverlapWithGroup(this.enemyArmy.goblins);
  }

  update(time, delta) {
    // player.update();
    this.playerArmy.update(time, delta, this.enemyArmy);

    this.enemyArmy.update(time, delta, this.playerArmy);

    // Update entities that are in the process of dying.
    this.scene.dyingEntities.getChildren().forEach(entity => {
      if (entity) { // It's good practice to check if the entity exists before updating.
        entity.update(time, delta);
      }
    });

    //this.castle.update(this.playerArmy.warriors);

    // towers update
    //this.towers.update(this.playerArmy.warriors, this.enemyArmy.goblins);
  }
}
