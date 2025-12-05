
/**
 * Manages the player's resources (wood, meat, gold).
 * Emits an event when resources change to allow UI updates.
 */
export default class ResourceManager extends Phaser.Events.EventEmitter {
  constructor() {
    super();

    this.resources = {
      wood: 50, // Starting resources
      meat: 20,
      gold: 0,
    };
  }

  /**
   * Adds a specified amount of a resource.
   * @param {string} type - The type of resource ('wood', 'meat', 'gold').
   * @param {number} amount - The amount to add.
   */
  add(type, amount) {
    if (this.resources.hasOwnProperty(type)) {
      this.resources[type] += amount;
      this.emit('resourceChanged', type, this.resources[type]);
    }
  }

  /**
   * Checks if there are enough resources to meet a given cost.
   * @param {object} cost - An object with resource types as keys and amounts as values (e.g., { wood: 10, gold: 5 }).
   * @returns {boolean} - True if all resource costs can be met, false otherwise.
   */
  hasEnough(cost) {
    for (const type in cost) {
      if (this.resources[type] < cost[type]) {
        return false; // Not enough of at least one resource
      }
    }
    return true;
  }

  /**
   * Spends the resources required for a given cost.
   * Assumes hasEnough(cost) was checked beforehand.
   * @param {object} cost - An object with resource types as keys and amounts as values.
   */
  spend(cost) {
    for (const type in cost) {
      if (this.resources.hasOwnProperty(type)) {
        this.resources[type] -= cost[type];
        this.emit('resourceChanged', type, this.resources[type]);
      }
    }
  }

  /**
   * Gets the current amount of a specific resource.
   * @param {string} type - The resource type.
   */
  get(type) {
    return this.resources[type] || 0;
  }
}