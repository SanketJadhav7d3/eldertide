import { BALANCE } from '../balance.js';
import { StructureStates } from './states.js';

/**
 * How many units the player has and how many they may have (see BALANCE.population).
 *
 * Nothing is counted incrementally: every value is worked out from the scene when asked, so it can't
 * drift when units die, houses burn down or queues are cancelled.
 */
export default class PopulationManager {
  constructor(scene) {
    this.scene = scene;
  }

  /** Living units (dying units have already left their army group). */
  get units() {
    const army = this.scene.playerArmy;
    if (!army) return 0;
    return army.workers.getLength() + army.warriors.getLength() + army.lancers.getLength() + army.archers.getLength();
  }

  /** Units waiting in a training queue; each already holds its place. */
  get queued() {
    return this.productionBuildings().reduce((count, building) => count + building.productionQueue.length, 0);
  }

  /** Places taken: living units plus queued ones. */
  get used() {
    return this.units + this.queued;
  }

  get capacity() {
    const { base, castle, perHouse, max } = BALANCE.population;
    const houses = this.scene.houses ? this.scene.houses.getChildren().filter(isFinished).length : 0;
    const castleRoom = this.scene.castle && isFinished(this.scene.castle) ? castle : 0;
    return Math.min(max, base + castleRoom + houses * perHouse);
  }

  /** True if `count` more units can be queued without going over the limit. */
  canQueue(count = 1) {
    return this.used + count <= this.capacity;
  }

  /**
   * True if a trained unit can come out now. Normally always true (its place was taken when it was
   * queued), but not after a house was destroyed: the unit then waits until there is room again.
   */
  hasRoomToSpawn() {
    return this.units < this.capacity;
  }

  productionBuildings() {
    const scene = this.scene;
    const buildings = [...(scene.barracks?.getChildren() ?? []), ...(scene.archeries?.getChildren() ?? [])];
    if (scene.castle) buildings.push(scene.castle);
    return buildings.filter(building => building.productionQueue && building.currentState !== StructureStates.DESTROYED);
  }
}

function isFinished(building) {
  return building.currentState === StructureStates.BUILT;
}
