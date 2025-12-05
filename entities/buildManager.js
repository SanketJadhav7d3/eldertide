import { House, Barracks, Tower, Castle, Archery, Monastery } from './structureEntity.js';

/**
 * Manages the process of selecting and placing buildings.
 * Interacts with the ResourceManager to check and spend resources.
 */
export default class BuildManager {
  constructor(scene, resourceManager) {
    this.scene = scene;
    this.resourceManager = resourceManager;
    this.selectedStructure = null; // e.g., 'House', 'Barracks'
    this.selectedStructureType = null;
  }

  /**
   * Called when a player clicks a UI button to build a structure.
   * @param {string} structureType - The key for the structure to build (e.g., 'House').
   */
  selectStructure(structureType) {
    const structureClass = this.getStructureClass(structureType);
    if (!structureClass) return;

    // Check if the player has enough resources.
    if (this.resourceManager.hasEnough(structureClass.COST)) {
      this.selectedStructure = structureClass; // The class itself
      this.selectedStructureType = structureType; // The string key
      console.log(`Selected ${structureType}. Place it on the map.`);
      // Next, you would typically enter a "placement mode" where the player
      // sees a ghost of the building under their cursor.
    } else { 
      console.log(`Not enough resources to build ${structureType}.`);
      // You could show a UI message here.
    }
  }

  /**
   * Called when the player clicks on the map to place the selected structure.
   * @param {number} x - The world x-coordinate.
   * @param {number} y - The world y-coordinate.
   */
  placeStructure(worldX, worldY) {
    if (!this.selectedStructure) return;

    // The scene handles converting world coords to tile-centered coords
    const tileX = this.scene.pathLayer.worldToTileX(worldX);
    const tileY = this.scene.pathLayer.worldToTileY(worldY);
    const landTile = this.scene.landLayer.getTileAt(tileX, tileY);
    const [x, y] = [landTile.getCenterX(), landTile.getCenterY()];

    // Spend the resources
    this.resourceManager.spend(this.selectedStructure.COST);

    // Create the new structure instance in the scene
    const newStructure = new this.selectedStructure(this.scene, x, y);

    console.log(`Placed ${this.selectedStructure.name} at ${x}, ${y}.`);
    this.selectedStructure = null; // Exit placement mode
    this.selectedStructureType = null;
    return newStructure; // Return the new instance to the scene
  }

  /**
   * Maps a string key to a class reference.
   * @param {string} type - The key for the structure.
   * @returns {class} The corresponding structure class.
   */
  getStructureClass(type) {
    // Capitalize the first letter to match the class names in the map.
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    const map = {
      'House': House,
      'Barracks': Barracks,
      'Tower': Tower,
      'Castle': Castle,
      'Archery': Archery,
      'Monastery': Monastery,
      // Add other structures here
    };
    return map[capitalizedType];
  }
}