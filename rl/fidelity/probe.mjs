// Measures the real browser game: loads it headlessly in Edge, sets up small scenarios with the
// game's own objects, and times them on the game clock (scene.time.now, in ms).
//   node fidelity_probe.mjs http://localhost:8099 out.json
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

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
    clear() {
      for (const o of made.splice(0)) {
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
  const result = await page.evaluate(fn, arg);
  await page.evaluate(() => H.clear());
  console.log(name, JSON.stringify(result));
  return result;
}

const results = {};

// ---------------------------------------------------------------- movement
results.walk_straight_10cells = await scenario('walk straight', async () => {
  const w = H.spawn('Worker', 30, 30);
  await H.sleep(300);
  w.moveToTile(40, 30, S.grid);
  const ms = await H.until(() => Math.abs(w.x - H.px(40)) < 0.5 && Math.abs(w.y - H.px(30)) < 0.5, 20000);
  return { ms, px: 320 };
});
results.walk_diagonal_10cells = await scenario('walk diagonal', async () => {
  const w = H.spawn('Worker', 30, 34);
  await H.sleep(300);
  w.moveToTile(40, 44, S.grid);
  const ms = await H.until(() => Math.abs(w.x - H.px(40)) < 0.5 && Math.abs(w.y - H.px(44)) < 0.5, 20000);
  return { ms, px: 320 * Math.SQRT2 };
});

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
    S.enemyArmy.goblins.remove(d); d.destroy();
  }
  const d = H.dummy(tower.x + 300, tower.y, 100000);
  const hits = [];
  let last = d.health;
  const t0 = H.now();
  await H.until(() => { if (d.health !== last) { hits.push(H.now() - t0); last = d.health; } return hits.length >= 6; }, 15000);
  return { range: out, hit_times: hits, damage: 100000 - d.health, center: [tower.x, tower.y] };
});

results.errors = errors;
writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
