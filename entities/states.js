
//  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄ 
// ▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌
// ▐░█▀▀▀▀▀▀▀▀▀  ▀▀▀▀█░█▀▀▀▀ ▐░█▀▀▀▀▀▀▀█░▌ ▀▀▀▀█░█▀▀▀▀ ▐░█▀▀▀▀▀▀▀▀▀ ▐░█▀▀▀▀▀▀▀▀▀ 
// ▐░▌               ▐░▌     ▐░▌       ▐░▌     ▐░▌     ▐░▌          ▐░▌          
// ▐░█▄▄▄▄▄▄▄▄▄      ▐░▌     ▐░█▄▄▄▄▄▄▄█░▌     ▐░▌     ▐░█▄▄▄▄▄▄▄▄▄ ▐░█▄▄▄▄▄▄▄▄▄ 
// ▐░░░░░░░░░░░▌     ▐░▌     ▐░░░░░░░░░░░▌     ▐░▌     ▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌
//  ▀▀▀▀▀▀▀▀▀█░▌     ▐░▌     ▐░█▀▀▀▀▀▀▀█░▌     ▐░▌     ▐░█▀▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀▀█░▌
//           ▐░▌     ▐░▌     ▐░▌       ▐░▌     ▐░▌     ▐░▌                    ▐░▌
//  ▄▄▄▄▄▄▄▄▄█░▌     ▐░▌     ▐░▌       ▐░▌     ▐░▌     ▐░█▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄█░▌
// ▐░░░░░░░░░░░▌     ▐░▌     ▐░▌       ▐░▌     ▐░▌     ▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌
//  ▀▀▀▀▀▀▀▀▀▀▀       ▀       ▀         ▀       ▀       ▀▀▀▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀▀▀▀ 
//


class EntityStates {
  static IDLE_LEFT = "IDLE_LEFT";
  static IDLE_RIGHT = "IDLE_RIGHT";

  static RUN_RIGHT = "RUN_RIGHT";
  static RUN_LEFT = "RUN_LEFT";

  static DEAD = "DEAD";
}

export class WarriorStates extends EntityStates {
  static UPWARD_SLASH_LEFT = "UPWARD_SLASH_LEFT";
  static UPWARD_SLASH_RIGHT = "UPWARD_SLASH_RIGHT";

  static DOWNWARD_SLASH_LEFT = "DOWNWARD_SLASH_LEFT";
  static DOWNWARD_SLASH_RIGHT = "DOWNWARD_SLASH_RIGHT";

  static UPWARD_SLASH_FRONT = "UPWARD_SLASH_FRONT";
  static DOWNWARD_SLASH_FRONT = "DOWNWARD_SLASH_FRONT";

  static UPWARD_SLASH_BACK = "UPWARD_SLASH_BACK";
  static DOWNWARD_SLASH_BACK = "DOWNWARD_SLASH_BACK";
}

export class GoblinStates extends EntityStates {
  static ATTACK_LEFT = "ATTACK_LEFT";
  static ATTACK_RIGHT = "ATTACK_RIGHT";

  static ATTACK_UP = "ATTACK_UP";
  static ATTACK_DOWN = "ATTACK_DOWN";
}

export class WorkerStates extends EntityStates {
  static CUT_RIGHT = "CUT_RIGHT";
  static CUT_LEFT = "CUT_LEFT";

  static HAMMER_RIGHT = "HAMMER_RIGHT";
  static HAMMER_LEFT = "HAMMER_LEFT";

  static PICK_GOLD_RIGHT = "PICK_GOLD_RIGHT";
  static PICK_GOLD_LEFT = "PICK_GOLD_LEFT";
}

export class ArcherStates extends EntityStates {
}

export class BomberStates extends EntityStates {
  static THROW_RIGHT = "THROW_RIGHT";
  static THROW_LEFT = "THROW_LEFT";
}

export class StructureStates {

  static ATTACKED = "ATTACKED";
  static BUILT = "BUILT";
  static DESTROYED = "DESTROYED";
  static CONSTRUCT = "CONSTRUCT";

}
