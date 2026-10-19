// Measures the real browser game: loads it headlessly in Edge, sets up small scenarios with the
// game's own objects, and times them on the game clock (scene.time.now, in ms).
//   npm install, start the game's server (node tools/editor-server.mjs 8099), then
//   node probe.mjs http://localhost:8099 browser_measurements.json
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message); });

await page.goto(`${base}/index.html`);
await page.waitForFunction(() => window.game?.scene?.getScene('StartScene')?.sys.isActive(), null, { timeout: 60000 });
await page.evaluate(() => {
  window.game.registry.set('mapPath', 'maps/island_64.tmj');
  window.game.scene.stop('StartScene');
  window.game.scene.start('LoadingScene');
});
await page.waitForFunction(() => window.game.scene.getScene('VillageScene')?.playerArmy, null, { timeout: 120000 });
await page.waitForTimeout(1500);
console.log('game loaded');

// ---------------------------------------------------------------- helpers in the page
await page.evaluate(async () => {
  // The game's own classes (the same module instances the game uses).
  window.__classes = await import('/entities/structureEntity.js');
  window.__Sheep = (await import('/entities/sheepEntity.js')).default;
  const S = window.game.scene.getScene('VillageScene');
  window.S = S;
  // The game opens with its tutorial, which pauses the village: close it the way the game does.
  const ui = window.game.scene.getScene('UIScene');
  if (ui && typeof ui.closeTutorial === 'function') ui.closeTutorial();
  if (S.sys.isPaused()) S.scene.resume();
  S.waveManager.timeUntilNextWave = 1e12;
  S.updateSheepPopulation = () => {};
  const kill = g => g.getChildren().slice().forEach(o => { g.remove(o); o.destroy(); });
  const a = S.playerArmy;
  [a.workers, a.warriors, a.lancers, a.archers, S.trees, S.sheeps, S.goldMines, S.decorations, S.enemyArmy.goblins].forEach(kill);
  S.resourceManager.resources = { wood: 100000, meat: 100000, gold: 100000 };

  const groups = { Worker: a.workers, Warrior: a.warriors, Lancer: a.lancers, Archer: a.archers };
  const made = [];
  window.H = {
    now: () => S.time.now,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async until(cond, timeoutMs) {
      const t0 = S.time.now, wall = Date.now();
      while (!cond()) {
        if (S.time.now - t0 > timeoutMs || Date.now() - wall > timeoutMs * 3 + 5000) return null;
        await new Promise(r => setTimeout(r, 15));
      }
      return S.time.now - t0;
    },
    px: cell => cell * 32 + 16,  // centre of a 32 px pathfinding cell
    walkable: (cx, cy) => S.grid.isWalkableAt(cx, cy),
    spawn(kind, cx, cy) {
      if (!S.grid.isWalkableAt(cx, cy)) throw new Error(`cell ${cx},${cy} is not walkable`);
      a['spawn' + kind]((cx * 32 + 16) / 64, (cy * 32 + 16) / 64);
      const g = groups[kind];
      const u = g.getChildren()[g.getLength() - 1];
      made.push(u);
      return u;
    },
    dummy(x, y, hp) {  // a goblin that never moves or attacks, at world px (x, y)
      S.enemyArmy.spawnGoblin(x / 64, y / 64);
      const g = S.enemyArmy.goblins.getChildren()[S.enemyArmy.goblins.getLength() - 1];
      g.runAI = () => {};
      g.health = hp;
      made.push(g);
      return g;
    },
    keep(o) { made.push(o); return o; },
    // Arrows still flying are cancelled before anything is removed: one landing on a removed target
    // would throw inside the game's update loop and quietly break every later scenario.
    cancelArrows() {
      for (const arrow of S.projectiles.getChildren().slice()) {
        if (arrow.impactTimer) arrow.impactTimer.remove(false);
        arrow.destroy();
      }
    },
    clear() {
      H.cancelArrows();
      for (const o of made.splice(0)) {
        S.tweens.killTweensOf(o);  // a walk still running would call into the removed object
        for (const g of [...Object.values(groups), S.enemyArmy.goblins, S.trees, S.sheeps, S.goldMines, S.houses, S.towers])
          if (g.contains && g.contains(o)) g.remove(o);
        if (o === S.castle) S.castle = null;
        if (o.scene) o.destroy();
      }
    },
    res: k => S.resourceManager.resources[k],
  };
});

async function scenario(name, fn, arg) {
  if (errors.length) throw new Error(`the game threw an error before "${name}": ${errors[0]}`);
  const result = await page.evaluate(fn, arg);
  await page.evaluate(() => H.clear());
  console.log(name, JSON.stringify(result));
  return result;
}

const results = {};

// ---------------------------------------------------------------- gathering (worker starts right next to it)
results.chop_tree = await scenario('chop', async () => {
  const tree = H.keep(new window.__classes.Tree(S, 64 * 26 + 32, 64 * 24 + 32));
  S.trees.add(tree);
  const tc = tree.getPosTile();
  const w = H.spawn('Worker', tc[0] + 1, tc[1]);
  await H.sleep(300);
  const start = H.res('wood'), t0 = H.now(), gains = [];
  let last = start;
  w.cutTree(tree);
  await H.until(() => { const v = H.res('wood'); if (v !== last) { gains.push([H.now() - t0, v - last]); last = v; } return !tree.scene || !tree.active; }, 30000);
  return { gains, total: H.res('wood') - start, fell_ms: H.now() - t0 };
});
results.mine_gold = await scenario('mine', async () => {
  const mine = H.keep(new window.__classes.GoldMine(S, 64 * 36 + 32, 64 * 24 + 32));
  S.goldMines.add(mine);
  const mc = mine.getPosTile();
  const w = H.spawn('Worker', mc[0] + 1, mc[1]);
  await H.sleep(300);
  const start = H.res('gold'), t0 = H.now(), gains = [];
  let last = start;
  w.mineGold(mine);
  await H.until(() => { const v = H.res('gold'); if (v !== last) { gains.push([H.now() - t0, v - last]); last = v; } return gains.length >= 12; }, 30000);
  return { gains, total: H.res('gold') - start };
});
results.harvest_sheep = await scenario('sheep', async () => {
  const SheepClass = window.__Sheep;
  const sheep = H.keep(new SheepClass(S, 64 * 30 + 32, 64 * 30 + 32));
  S.sheeps.add(sheep);
  const sc = sheep.getPosTile();
  const w = H.spawn('Worker', sc[0] + 1, sc[1]);
  await H.sleep(300);
  const start = H.res('meat'), t0 = H.now(), gains = [];
  let last = start;
  w.harvestMeat(sheep);
  await H.until(() => { const v = H.res('meat'); if (v !== last) { gains.push([H.now() - t0, v - last]); last = v; } return !sheep.scene; }, 40000);
  return { gains, total: H.res('meat') - start, done_ms: H.now() - t0 };
});

// ---------------------------------------------------------------- building and training
for (const workers of [1, 2]) {
  results[`build_house_${workers}_workers`] = await scenario(`house x${workers}`, async n => {
    const HouseClass = window.__classes.House;
    const house = H.keep(new HouseClass(S, 64 * 40 + 32, 64 * 30 + 32));
    S.houses.add(house);
    const hc = house.getPosTile();
    const ws = [];
    for (let i = 0; i < n; i++) ws.push(H.spawn('Worker', hc[0] + 3, hc[1] + 2 + i));
    await H.sleep(300);
    const t0 = H.now();
    ws.forEach(w => w.buildStructure(house));
    const started = await H.until(() => house.buildProgress > 0, 20000);
    const t1 = H.now();
    await H.until(() => house.currentState === 'BUILT', 60000);
    return { walk_ms: started, build_ms: H.now() - t1, points: house.maxBuildProgress };
  }, workers);
}
results.train_worker = await scenario('train', async () => {
  const castle = H.keep(new window.__classes.Castle(S, 64 * 22 + 32, 64 * 40 + 32));
  castle.currentState = 'BUILT';
  S.castle = castle;
  const before = S.playerArmy.workers.getLength();
  const t0 = H.now();
  const ok = castle.queueUnit('worker');
  const ms = await H.until(() => S.playerArmy.workers.getLength() > before, 20000);
  const fresh = S.playerArmy.workers.getChildren()[S.playerArmy.workers.getLength() - 1];
  if (fresh) H.keep(fresh);
  return { queued: ok, ms };
});

// ---------------------------------------------------------------- combat speed (attacker 64 px from a 60 hp target)
for (const [kind, gap] of [['Warrior', 64], ['Lancer', 64], ['Archer', 320]]) {
  results[`kill_${kind.toLowerCase()}`] = await scenario(`kill ${kind}`, async ([k, g]) => {
    const u = H.spawn(k, 40, 70);
    await H.sleep(1100);  // automatic targeting looks around once a second
    const t0 = H.now();
    const d = H.dummy(u.x + g, u.y, 60);
    const hits = [];
    let last = 60;
    await H.until(() => { if (d.health !== last) { hits.push([H.now() - t0, last - d.health]); last = d.health; } return d.health <= 0; }, 30000);
    return { hits, killed_ms: H.now() - t0, moved_px: Math.round(Math.hypot(u.x - H.px(40), u.y - H.px(70))) };
  }, [kind, gap]);
}

// ---------------------------------------------------------------- reach (defensive stance: attacks only without moving)
const reach = [];
for (const [kind, offsets] of [
  ['Warrior', [[1, 0], [1, 1], [2, 0]]],
  ['Lancer', [[1, 0], [1, 1], [2, 0], [2, 1]]],
  ['Archer', [[5, 0], [6, 0], [4, 3], [4, 4], [5, 3]]],
]) {
  for (const [dx, dy] of offsets) {
    const r = await scenario(`reach ${kind} ${dx},${dy}`, async ([k, ox, oy]) => {
      const u = H.spawn(k, 40, 70);
      u.setStance('DEFENSIVE');
      await H.sleep(200);
      const d = H.dummy(u.x + ox * 64, u.y + oy * 64, 1000);
      await H.until(() => d.health < 1000, 3500);
      return { hit: d.health < 1000, moved: Math.hypot(u.x - H.px(40), u.y - H.px(70)) > 1 };
    }, [kind, dx, dy]);
    reach.push({ kind: kind.toLowerCase(), dx, dy, ...r });
  }
}
results.reach = reach;

// ---------------------------------------------------------------- sight (aggressive: does it go after a target?)
const sight = [];
for (const cells of [3, 4, 5]) {
  const r = await scenario(`sight ${cells}`, async c => {
    const u = H.spawn('Warrior', 40, 90);
    await H.sleep(200);
    const d = H.dummy(u.x + c * 64, u.y, 1000);
    await H.until(() => d.health < 1000, 4000);
    return { engaged: d.health < 1000 };
  }, cells);
  sight.push({ cells, ...r });
}
results.sight = sight;

// ---------------------------------------------------------------- tower
results.tower = await scenario('tower', async () => {
  const tower = H.keep(new window.__classes.Tower(S, 64 * 45 + 32, 64 * 22 + 32));
  S.towers.add(tower);
  tower.currentState = 'BUILT';
  await H.sleep(300);
  const out = [];
  for (const dist of [400, 440, 460, 480, 520]) {
    const d = H.dummy(tower.x + dist, tower.y, 1000);
    await H.until(() => d.health < 1000, 3000);
    out.push({ dist, hit: d.health < 1000 });
    H.cancelArrows();
    S.enemyArmy.goblins.remove(d); d.destroy();
  }
  const d = H.dummy(tower.x + 300, tower.y, 100000);
  const hits = [];
  let last = d.health;
  const t0 = H.now();
  await H.until(() => { if (d.health !== last) { hits.push(H.now() - t0); last = d.health; } return hits.length >= 6; }, 15000);
  return { range: out, hit_times: hits, damage: 100000 - d.health, center: [tower.x, tower.y] };
});


// ---------------------------------------------------------------- tower firing rate
results.tower_rate = await scenario('tower rate', async () => {
  const tower = H.keep(new window.__classes.Tower(S, 64 * 45 + 32, 64 * 22 + 32));
  S.towers.add(tower);
  tower.currentState = 'BUILT';
  await H.sleep(300);
  const d = H.dummy(tower.x + 300, tower.y, 1e6);
  const hits = [], shots = [];
  let last = d.health, lastShot = tower.lastShotTime;
  const t0 = H.now();
  await H.until(() => {
    if (tower.lastShotTime !== lastShot) { shots.push(H.now() - t0); lastShot = tower.lastShotTime; }
    if (d.health !== last) { hits.push([H.now() - t0, last - d.health]); last = d.health; }
    return hits.length >= 6;
  }, 15000);
  return { hits, shots, health: d.health, active: d.active, state: d.currentState };
});

// ---------------------------------------------------------------- first hit: noticing, then wind-up
for (const [kind, gap] of [['Warrior', 64], ['Lancer', 64], ['Archer', 256]]) {
  const trials = [];
  for (let i = 0; i < 6; i++) {
    trials.push(await scenario(`first hit ${kind} ${i}`, async ([k, g, wait]) => {
      const u = H.spawn(k, 40, 70);
      await H.sleep(wait);  // a different point of its once-a-second look-around each trial
      const t0 = H.now();
      const d = H.dummy(u.x + g, u.y, 1000);
      let noticed = null;
      const hit = await H.until(() => {
        if (noticed === null && u.context.target === d) noticed = H.now() - t0;
        return d.health < 1000;
      }, 5000);
      return { noticed, hit };
    }, [kind, gap, 1100 + i * 170]));
  }
  results[`first_hit_${kind.toLowerCase()}`] = trials;
}

// ---------------------------------------------------------------- guard
results.guard = await scenario('guard', async () => {
  const ward = H.spawn('Worker', 30, 60);
  const guard = H.spawn('Warrior', 30, 63);
  await H.sleep(300);
  guard.guard(ward, 0);
  await H.sleep(500);
  const t0 = H.now();
  ward.moveToTile(50, 60, S.grid);  // 20 cells (640 px) east
  const gaps = [];
  let arrived = null;
  await H.until(() => {
    const t = H.now() - t0;
    gaps.push([Math.round(t), Math.round(Math.hypot(guard.x - ward.x, guard.y - ward.y))]);
    if (arrived === null && Math.abs(ward.x - H.px(50)) < 1) arrived = t;
    return arrived !== null && t > arrived + 3000;
  }, 15000);
  // An enemy 3 tiles (192 px) from the ward is fought; one 9 tiles away is not.
  const near = H.dummy(ward.x + 192, ward.y, 60);
  const far = H.dummy(ward.x, ward.y + 576, 60);
  const t1 = H.now();
  const killed = await H.until(() => near.health <= 0, 8000);
  await H.sleep(1500);
  const back = Math.round(Math.hypot(guard.x - ward.x, guard.y - ward.y));
  return { ward_walk_ms: arrived, gaps, near_killed_ms: killed, far_health: far.health, distance_after: back };
});

// ---------------------------------------------------------------- attack-move
results.attack_move = await scenario('attack-move', async () => {
  const u = H.spawn('Warrior', 30, 80);
  await H.sleep(1200);
  const d = H.dummy(H.px(42), H.px(82), 60);  // beside the route, 2 cells off it
  const t0 = H.now();
  u.attackMoveToTile(54, 80);  // 24 cells east
  const killed = await H.until(() => d.health <= 0, 20000);
  const arrived = await H.until(() => Math.abs(u.x - H.px(54)) < 1 && Math.abs(u.y - H.px(80)) < 1 && !u.context.attackMoveDestination, 20000);
  return { killed_ms: killed, arrived_ms: (killed ?? 0) + (arrived ?? NaN), order_after: u.currentOrder };
});

// ---------------------------------------------------------------- a squad walking together
results.squad_move = await scenario('squad', async () => {
  const units = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) units.push(H.spawn('Warrior', 30 + c, 60 + r));
  await H.sleep(300);
  const t0 = H.now();
  // As a right-click with the 9 selected: a 3 x 3 formation around the clicked cell (handleRightClick).
  units.forEach((u, i) => u.moveToTile(50 + (i % 3) - 1, 61 + Math.floor(i / 3) - 1, S.grid));
  const arrivals = units.map(() => null);
  await H.until(() => {
    units.forEach((u, i) => {
      const tx = H.px(50 + (i % 3) - 1), ty = H.px(61 + Math.floor(i / 3) - 1);
      if (arrivals[i] === null && Math.abs(u.x - tx) < 1 && Math.abs(u.y - ty) < 1) arrivals[i] = H.now() - t0;
    });
    return arrivals.every(a => a !== null);
  }, 20000);
  return { arrivals };
});

// ---------------------------------------------------------------- four warriors clear four targets
results.group_fight = await scenario('group fight', async () => {
  const units = [0, 1, 2, 3].map(i => H.spawn('Warrior', 40, 64 + 2 * i));
  await H.sleep(1100);
  const t0 = H.now();
  const dummies = [0, 1, 2, 3].map(i => H.dummy(H.px(42), H.px(64 + 2 * i), 120));
  const done = await H.until(() => dummies.every(d => d.health <= 0), 20000);
  return { cleared_ms: done };
});


// ---------------------------------------------------------------- walking (repeated; the game has settled by now)
const walks = [];
for (let i = 0; i < 7; i++) {
  for (const [name, dx, dy, px] of [['straight', 20, 0, 640], ['diagonal', 10, 10, 320 * Math.SQRT2]]) {
    const r = await scenario(`walk ${name} ${i}`, async ([tx, ty]) => {
      const w = H.spawn('Worker', 30, 40);
      await H.sleep(400);
      w.moveToTile(30 + tx, 40 + ty, S.grid);
      const ms = await H.until(() => Math.abs(w.x - H.px(30 + tx)) < 0.5 && Math.abs(w.y - H.px(40 + ty)) < 0.5, 20000);
      return { ms };
    }, [dx, dy]);
    walks.push({ name, px, ms: r.ms });
  }
}
results.walks = walks;
// ---------------------------------------------------------------- arrows at moving targets
// An archer shoots at a target that keeps walking: along a long line (it rarely turns), back and forth
// over a short one (it turns often), or standing still. Shots and hits are counted for 40 s.
for (const [name, from, to, chase] of [['still', null, null, false], ['long', 32, 48, false], ['short', 38, 42, false], ['chase_long', 32, 48, true], ['chase_short', 38, 42, true]]) {
  results[`arrows_${name}`] = await scenario(`arrows ${name}`, async ([a, b, chase]) => {
    const archer = H.spawn('Archer', 40, 70);
    archer.setStance('DEFENSIVE');
    const target = H.dummy(H.px(a ?? 40), H.px(62), 1e9);
    let leg = 0;
    if (!chase && a !== null) {
      // Walking under an order, the way marches and right-click moves walk (moveToTile).
      const walk = () => {
        if (!target.scene) return;
        target.moveToTile(leg % 2 === 0 ? b : a, 62, S.grid, () => { leg++; walk(); });
      };
      walk();
    }
    // Chasing: one 32 px step at a time toward a waypoint, the way units chase (followEntity).
    const waypoint = { x: 0, y: 0, getPosTile() { return [Math.floor(this.x / 32), Math.floor(this.y / 32)]; } };
    let shots = 0, hits = 0, lastShot = archer.lastAttackTime, last = target.health;
    // Driven from the game's own per-frame update, as a chasing unit's AI drives it: the next step
    // starts on the frame the last one ends.
    const chaseStep = () => {
      if (!target.scene || (target.moveTween && target.moveTween.isPlaying())) return;
      if (Math.abs(target.x - H.px(leg % 2 === 0 ? b : a)) < 1) leg++;
      waypoint.x = H.px(leg % 2 === 0 ? b : a); waypoint.y = H.px(62);
      target.followEntity(waypoint);
    };
    if (chase) S.events.on('update', chaseStep);
    await H.until(() => {
      if (archer.lastAttackTime !== lastShot) { shots++; lastShot = archer.lastAttackTime; }
      if (target.health !== last) { hits++; last = target.health; }
      return false;
    }, 40000);
    S.events.off('update', chaseStep);
    return { shots, hits };
  }, [from, to, chase]);
}
results.errors = errors;
writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
