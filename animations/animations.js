
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

  scene.load.spritesheet("goblin-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Enemy/Troops/Torch/Purple/Torch_Purple.png",
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
  
  scene.load.spritesheet("dead-entity", "./Tiny Swords/Tiny Swords (Update 010)/Factions/Player/Dead/Dead.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });

  scene.load.spritesheet("wood-spawn", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/W_Spawn.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });
  
  scene.load.spritesheet("sheep-entity", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Sheep/HappySheep_All.png", 
    { frameWidth: 64*2, frameHeight: 64*2 });

  scene.load.spritesheet("meat-spawn", "./Tiny Swords/Tiny Swords (Update 010)/Resources/Resources/M_Spawn.png", 
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
    repeat: 0 
  });

  scene.anims.create({
    key: 'worker-run-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 6, end: 11 }), 
    frameRate: 10,
    repeat: 0 
  });

  scene.anims.create({
    key: 'worker-hammer-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 12, end: 17 }), 
    frameRate: 10,
    repeat: 0 
  });

  scene.anims.create({
    key: 'worker-cut-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 18, end: 23 }), 
    frameRate: 10,
    repeat: 0 
  });

  scene.anims.create({
    key: 'worker-pick-wood-anim',
    frames: scene.anims.generateFrameNumbers('worker-entity', { start: 30, end: 35 }), 
    frameRate: 10,
    repeat: 0 
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
  
  /*
  scene.anims.create({
    key: 'bomber-idle-anim',
    frames: scene.anims.generateFrameNumbers('bomber-entity', { start: 0, end: 5 }), 
    frameRate: 10,
    repeat: 0 
  });
  */ 
  

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
}
