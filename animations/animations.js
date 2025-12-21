
export function loadEntitySpriteSheet(scene) {
  scene.load.spritesheet("water-rock-02", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_02.png", 
    { frameWidth: 64 * 2, frameHeight: 64 * 2 });

  scene.load.spritesheet("water-rock-03", "./Tiny Swords/Tiny Swords (Update 010)/Terrain/Water/Rocks/Rocks_03.png", 
    { frameWidth: 64 * 2, frameHeight: 64 * 2 });


  //scene.load.spritesheet("warrior-entity-idle", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Warrior/Warrior_Idle.png", 
    //{ frameWidth: 64*3, frameHeight: 64*3 });

  //scene.load.spritesheet("warrior-entity-run", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Warrior/Warrior_Run.png", 
    //{ frameWidth: 64*8, frameHeight: 64*3 });

  scene.load.spritesheet("warrior-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Warrior/Red/Warrior_Red.png",
    { frameWidth: 64*3, frameHeight: 64*3 }
  )

  scene.load.spritesheet("warrior-entity-defend", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Warrior/Red/Warrior_Guard.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 3 }
  )

  scene.load.spritesheet("goblin-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Enemy/Troops/Torch/Purple/Torch_Purple.png",
    { frameWidth: 64*3, frameHeight: 64*3 }
  )

  scene.load.spritesheet("barrel-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Enemy/Troops/Barrel/Purple/Barrel_Purple.png",
    { frameWidth: 64*2, frameHeight: 64*2 }
  )

  scene.load.spritesheet("barrel-explosion", "./Tiny Swords/Tiny Swords (Update 010)/Effects/Explosion/Explosions.png",
    { frameWidth: 64*3, frameHeight: 64*3 }
  )

  scene.load.spritesheet("bomber-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Enemy/Troops/TNT/Purple/TNT_Purple.png",
    { frameWidth: 64*3, frameHeight: 64*3 }
  )

  // tree
  scene.load.spritesheet("tree-cuttable", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Trees/Tree.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 3});

  // deco tree
  scene.load.spritesheet("deco-tree-01", "./Tiny Swords/Tiny Swords (Update 010)/Deco-Trees/Tree1.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 4});

  scene.load.spritesheet("deco-tree-02", "./Tiny Swords/Tiny Swords (Update 010)/Deco-Trees/Tree2.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 4});

  scene.load.spritesheet("deco-tree-03", "./Tiny Swords/Tiny Swords (Update 010)/Deco-Trees/Tree3.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 3});

  scene.load.spritesheet("deco-tree-04", "./Tiny Swords/Tiny Swords (Update 010)/Deco-Trees/Tree4.png",
    { frameWidth: 64 * 3, frameHeight: 64 * 3});

  // worker
  scene.load.spritesheet("worker-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Pawn/Red/Pawn_Red.png", 
    { frameWidth: 64*3, frameHeight: 64*3 });
  
  // Archer (Bow)
  scene.load.spritesheet("archer-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Archer/Red/Archer_Red.png",
    { frameWidth: 192, frameHeight: 192 });
  
  scene.load.spritesheet("arrow-projectile", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Archer/Arrow/Arrow.png",
    { frameWidth: 64, frameHeight: 64 });

  scene.load.spritesheet("bomb-projectile", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Enemy/Troops/TNT/Dynamite/Dynamite.png",
    { frameWidth: 64, frameHeight: 64 });

  scene.load.spritesheet("dead-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Dead/Dead.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });

  scene.load.spritesheet("wood-spawn", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/W_Spawn.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });
  
  scene.load.spritesheet("sheep-entity", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Sheep/HappySheep_All.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });

  scene.load.spritesheet("meat-spawn", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/M_Spawn.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });

  // Lancer (uses spear)
  scene.load.spritesheet("lancer-idle", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_Idle.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });

  scene.load.spritesheet("lancer-run", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_Run.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });

  scene.load.spritesheet("lancer-attack", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_Right_Attack.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });

  scene.load.spritesheet("lancer-up-right-attack", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_UpRight_Attack.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });

  scene.load.spritesheet("lancer-down-right-attack", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_DownRight_Attack.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });

  scene.load.spritesheet("lancer-down-attack", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_Down_Attack.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });
  
  scene.load.spritesheet("lancer-up-attack", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Red Units/Lancer/Lancer_Up_Attack.png", 
    { frameWidth: 64*5, frameHeight: 64*5 });


  scene.load.spritesheet("fire", "./Tiny Swords/Tiny Swords (Update 010)/Effects/Fire/Fire.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });
}

export function createAnimations(scene) {

  //scene.anims.create({
    //key: 'wind',
    //frames: scene.anims.generateFrameNumbers('tree-cuttable', { start: 0, end: 3 }), 
    //frameRate: 7,
    //repeat: -1
  //});

  scene.anims.create({
    key: 'rock-anim-02',
    frames: scene.anims.generateFrameNumbers('water-rock-02', { start: 0, end: 7 }), 
    frameRate: 7,
    repeat: -1
  });

  scene.anims.create({
    key: 'rock-anim-03',
    frames: scene.anims.generateFrameNumbers('water-rock-03', { start: 0, end: 7 }), 
    frameRate: 7,
    repeat: -1
  });

  //  █     █░ ▄▄▄       ██▀███   ██▀███   ██▓ ▒█████   ██▀███  
  // ▓█░ █ ░█░▒████▄    ▓██ ▒ ██▒▓██ ▒ ██▒▓██▒▒██▒  ██▒▓██ ▒ ██▒
  // ▒█░ █ ░█ ▒██  ▀█▄  ▓██ ░▄█ ▒▓██ ░▄█ ▒▒██▒▒██░  ██▒▓██ ░▄█ ▒
  // ░█░ █ ░█ ░██▄▄▄▄██ ▒██▀▀█▄  ▒██▀▀█▄  ░██░▒██   ██░▒██▀▀█▄  
  // ░░██▒██▓  ▓█   ▓██▒░██▓ ▒██▒░██▓ ▒██▒░██░░ ████▓▒░░██▓ ▒██▒
  // ░ ▓░▒ ▒   ▒▒   ▓▒█░░ ▒▓ ░▒▓░░ ▒▓ ░▒▓░░▓  ░ ▒░▒░▒░ ░ ▒▓ ░▒▓░
  //   ▒ ░ ░    ▒   ▒▒ ░  ░▒ ░ ▒░  ░▒ ░ ▒░ ▒ ░  ░ ▒ ▒░   ░▒ ░ ▒░
  //   ░   ░    ░   ▒     ░░   ░   ░░   ░  ▒ ░░ ░ ░ ▒    ░░   ░ 
  //     ░          ░  ░   ░        ░      ░      ░ ░     ░     
  //                                                            

  scene.anims.create({
    key: 'warrior-idle-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-run-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 6, end: 11 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-downward-slash-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 6, end: 11 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-upward-slash-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 12, end: 23 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-downward-slash-front-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 24, end: 29 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-upward-slash-front-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 30, end: 35 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-downward-slash-back-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 36, end: 41 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-upward-slash-back-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity', { start: 42, end: 47 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'warrior-defend-anim',
    frames: scene.anims.generateFrameNumbers('warrior-entity-defend', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  /*
  _______             ______              
  ___    |_______________  /______________
  __  /| |_  ___/  ___/_  __ \  _ \_  ___/
  _  ___ |  /   / /__ _  / / /  __/  /    
  /_/  |_/_/    \___/ /_/ /_/\___//_/     
                                          
  */

  scene.anims.create({
    key: 'lancer-idle-anim',
    frames: scene.anims.generateFrameNumbers('lancer-idle', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-run-anim',
    frames: scene.anims.generateFrameNumbers('lancer-run', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-attack-right-anim',
    frames: scene.anims.generateFrameNumbers('lancer-attack', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-attack-down-anim',
    frames: scene.anims.generateFrameNumbers('lancer-down-attack', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-attack-up-anim',
    frames: scene.anims.generateFrameNumbers('lancer-up-attack', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-attack-up-right-anim',
    frames: scene.anims.generateFrameNumbers('lancer-up-right-attack', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'lancer-attack-down-right-anim',
    frames: scene.anims.generateFrameNumbers('lancer-down-right-attack', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1
  });

  // Archer (Bow) Animations
  scene.anims.create({
    key: 'archer-idle-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-run-anim',
    // this is correct
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 8, end: 13 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-shoot-right-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 24, end: 31 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-shoot-up-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 16, end: 23 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-shoot-down-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 48, end: 55 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-shoot-up-right-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 24, end: 31 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'archer-shoot-down-right-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 40, end: 47 }), 
    frameRate: 10,
    repeat: -1
  });


  // arrow
  scene.anims.create({
    key: 'arrow-flying',
    frames: scene.anims.generateFrameNumbers('arrow-projectile', { start: 0, end: 0 }), 
    frameRate: 10,
    repeat: 0
  });

  scene.anims.create({
    key: 'arrow-stuck',
    frames: scene.anims.generateFrameNumbers('arrow-projectile', { start: 1, end: 1 }), 
    frameRate: 10,
    repeat: 0
  });
  

  //   ▄▀  ████▄ ███   █    ▄█    ▄   
  // ▄▀    █   █ █  █  █    ██     █  
  // █ ▀▄  █   █ █ ▀ ▄ █    ██ ██   █ 
  // █   █ ▀████ █  ▄▀ ███▄ ▐█ █ █  █ 
  //  ███        ███       ▀ ▐ █  █ █ 
  //                           █   ██ 
  //                                  

  scene.anims.create({
    key: 'goblin-idle-anim',
    frames: scene.anims.generateFrameNumbers('goblin-entity', { start: 0, end: 6 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'goblin-run-anim',
    frames: scene.anims.generateFrameNumbers('goblin-entity', { start: 7, end: 12 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'goblin-attack-anim',
    frames: scene.anims.generateFrameNumbers('goblin-entity', { start: 14, end: 19 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'goblin-attack-up-anim',
    frames: scene.anims.generateFrameNumbers('goblin-entity', { start: 28, end: 33 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'goblin-attack-down-anim',
    frames: scene.anims.generateFrameNumbers('goblin-entity', { start: 21, end: 26 }), 
    frameRate: 10,
    repeat: -1
  });

  scene.anims.create({
    key: 'dead-anim-1',
    // Assuming death frames are after the attack frames. Adjust as needed.
    frames: scene.anims.generateFrameNumbers('dead-entity', { start: 0, end: 6 }), 
    frameRate: 10,
    repeat: 0 
  });

  scene.anims.create({
    key: 'dead-anim-2',
    // Assuming death frames are after the attack frames. Adjust as needed.
    frames: scene.anims.generateFrameNumbers('dead-entity', { start: 7, end: 13 }), 
    frameRate: 10,
    repeat: 0 // Should only play once
  });


  // ____    __    ____  ______   .______       __  ___  _______ .______      
  // \   \  /  \  /   / /  __  \  |   _  \     |  |/  / |   ____||   _  \     
  //  \   \/    \/   / |  |  |  | |  |_)  |    |  '  /  |  |__   |  |_)  |    
  //   \            /  |  |  |  | |      /     |    <   |   __|  |      /     
  //    \    /\    /   |  `--'  | |  |\  \----.|  .  \  |  |____ |  |\  \----.
  //     \__/  \__/     \______/  | _| `._____||__|\__\ |_______|| _| `._____|
  //                                                                          

  scene.anims.create({
    key: 'worker-idle-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'worker-run-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 6, end: 11 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'worker-hammer-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 12, end: 17 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'worker-cut-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 18, end: 23 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'worker-pick-wood-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 30, end: 35 }), 
    frameRate: 10,
    repeat: -1 
  });

  //      ___      .______        ______  __    __   _______ .______      
  //     /   \     |   _  \      /      ||  |  |  | |   ____||   _  \     
  //    /  ^  \    |  |_)  |    |  ,----'|  |__|  | |  |__   |  |_)  |    
  //   /  /_\  \   |      /     |  |     |   __   | |   __|  |      /     
  //  /  _____  \  |  |\  \----.|  `----.|  |  |  | |  |____ |  |\  \----.
  // /__/     \__\ | _| `._____| \______||__|  |__| |_______|| _| `._____|
  //                                                                      


  /*
  scene.anims.create({
    key: 'archer-idle-anim',
    frames: scene.anims.generateFrameNumbers('archer-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: 0 
  });
  */


  // ███   ████▄ █▀▄▀█ ███   ▄███▄   █▄▄▄▄ 
  // █  █  █   █ █ █ █ █  █  █▀   ▀  █  ▄▀ 
  // █ ▀ ▄ █   █ █ ▄ █ █ ▀ ▄ ██▄▄    █▀▀▌  
  // █  ▄▀ ▀████ █   █ █  ▄▀ █▄   ▄▀ █  █  
  // ███            █  ███   ▀███▀     █   
  //               ▀                  ▀    


  scene.anims.create({
    key: 'bomber-idle-anim',
    frames: scene.anims.generateFrameNumbers('bomber-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'bomber-run-anim',
    frames: scene.anims.generateFrameNumbers('bomber-entity', { start: 7, end: 12 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'bomber-throw-anim',
    frames: scene.anims.generateFrameNumbers('bomber-entity', { start: 14, end: -1 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'bomb-projectile-mid-air-anim',
    frames: scene.anims.generateFrameNumbers('bomb-projectile', { start: 0, end: -1 }), 
    frameRate: 10,
    repeat: -1 
  });
  
/*
  ____                      _ 
 | __ )  __ _ _ __ _ __ ___| |
 |  _ \ / _` | '__| '__/ _ \ |
 | |_) | (_| | |  | | |  __/ |
 |____/ \__,_|_|  |_|  \___|_|
                              
*/

  scene.anims.create({
    key: 'barrel-idle-anim',
    frames: scene.anims.generateFrameNumbers('barrel-entity', { start: 0, end: 0 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'barrel-peak-anim',
    frames: scene.anims.generateFrameNumbers('barrel-entity', { start: 18, end: 23 }), 
    frameRate: 10,
    repeat: 0 
  });

  scene.anims.create({
    key: 'barrel-run-anim',
    frames: scene.anims.generateFrameNumbers('barrel-entity', { start: 6, end: 11 }), 
    frameRate: 10,
    repeat: -1 
  });

  scene.anims.create({
    key: 'barrel-lit-anim',
    frames: scene.anims.generateFrameNumbers('barrel-entity', { start: 30, end: 32 }), 
    frameRate: 3,
    repeat: 0 
  });

  scene.anims.create({
    key: 'barrel-explosion-anim',
    frames: scene.anims.generateFrameNumbers('barrel-explosion', { start: 0, end: -1 }), 
    frameRate: 15,
    repeat: 0 
  });
  

  // ▓█████▄  ██▓▓█████ 
  // ▒██▀ ██▌▓██▒▓█   ▀ 
  // ░██   █▌▒██▒▒███   
  // ░▓█▄   ▌░██░▒▓█  ▄ 
  // ░▒████▓ ░██░░▒████▒
  //  ▒▒▓  ▒ ░▓  ░░ ▒░ ░
  //  ░ ▒  ▒  ▒ ░ ░ ░  ░
  //  ░ ░  ░  ▒ ░   ░   
  //    ░     ░     ░  ░
  //  ░                 

  /*
  */
  scene.anims.create({
    key: 'dead-anim',
    frames: scene.anims.generateFrameNumbers('dead-entity', { start: 0, end: 6 }), 
    frameRate: 10,
    repeat: 0 
  });


  //    ___________                      
  //    \__    ___/______   ____   ____  
  //      |    |  \_  __ \_/ __ \_/ __ \ 
  //      |    |   |  | \/\  ___/\  ___/ 
  //      |____|   |__|    \___  >\___  >
  //                           \/     \/ 


  scene.anims.create({
    key: 'cuttable-tree-idle-anim',
    frames: scene.anims.generateFrameNumbers('tree-cuttable', { start: 0, end: 3 }),
    frameRate: 5,
    repeat: -1
  });

  scene.anims.create({
    key: 'deco-tree-01-idle-anim',
    frames: scene.anims.generateFrameNumbers('deco-tree-01', { start: 0, end: 7 }),
    frameRate: 5,
    repeat: -1
  });

  scene.anims.create({
    key: 'deco-tree-02-idle-anim',
    frames: scene.anims.generateFrameNumbers('deco-tree-02', { start: 0, end: 7 }),
    frameRate: 5,
    repeat: -1
  });

  scene.anims.create({
    key: 'deco-tree-03-idle-anim',
    frames: scene.anims.generateFrameNumbers('deco-tree-03', { start: 0, end: 7 }),
    frameRate: 5,
    repeat: -1
  });

  scene.anims.create({
    key: 'deco-tree-04-idle-anim',
    frames: scene.anims.generateFrameNumbers('deco-tree-04', { start: 0, end: 7 }),
    frameRate: 5,
    repeat: -1
  });

  // wood
  scene.anims.create({
    key: 'wood-spawn-anim',
    frames: scene.anims.generateFrameNumbers('wood-spawn', { start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0
  });

  // meat
  scene.anims.create({
    key: 'meat-spawn-anim',
    frames: scene.anims.generateFrameNumbers('meat-spawn', { start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0
  });


  // sheep
  scene.anims.create({
    key: 'sheep-idle-anim',
    frames: scene.anims.generateFrameNumbers('sheep-entity', { start: 0, end: 7 }),
    frameRate: 10,
    repeat: -1
  });

  // sheep bouncing
  scene.anims.create({
    key: 'sheep-bouncing-anim',
    frames: scene.anims.generateFrameNumbers('sheep-entity', { start: 8, end: 13 }),
    frameRate: 10,
    repeat: 0
  });

  scene.anims.create({
    key: 'fire',
    frames: scene.anims.generateFrameNumbers('fire-anim', { start: 0, end: -1 }),
    frameRate: 10,
    repeat: 0
  });
}
