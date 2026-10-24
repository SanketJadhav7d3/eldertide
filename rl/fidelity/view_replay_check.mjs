// Checks the replay viewer in headless Edge: opens a replay through the start screen, screenshots a few
// moments, plays to the end and leaves. Needs the game served on :8099 (node tools/editor-server.mjs 8099).
//   node view_replay_check.mjs <replay file> <folder for screenshots>
import { chromium } from 'playwright-core';

const [file, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
// Listen for the file dialog from the start: enabling interception later races the click.
const chooser = new Promise(resolve => page.on('filechooser', resolve));
page.on('pageerror', e => errors.push(String(e)));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto('http://localhost:8099/index.html');
await page.waitForFunction(() => window.game?.scene.getScene('StartScene')?.sys.isActive());
await page.waitForTimeout(2000);
await page.mouse.click(700 + 125, 450 + 340);
await (await chooser).setFiles(file);
await page.waitForFunction(() => window.game.scene.getScene('ReplayScene')?.sys.isActive(), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/replay_start.png` });
const end = await page.evaluate(() => window.game.scene.getScene('ReplayScene').end);
for (const frac of [0.35, 0.7, 0.93]) {
  await page.evaluate(t => { const s = window.game.scene.getScene('ReplayScene'); s.setPlaying(false); s.seek(t); }, Math.round(end * frac));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/replay_${Math.round(frac * 100)}.png` });
}
// Zoom in on the busiest spot at 70%.
const spot = await page.evaluate(t => {
  const s = window.game.scene.getScene('ReplayScene');
  s.seek(t);
  const vis = [...s.layer.units.values()].filter(u => u.visible);
  const x = vis.reduce((a, u) => a + u.x, 0) / vis.length, y = vis.reduce((a, u) => a + u.y, 0) / vis.length;
  s.cameras.main.setZoom(1).centerOn(x, y);
  return { units: vis.length, arrows: s.layer.arrows.filter(a => a.visible).length };
}, Math.round(end * 0.7));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/replay_zoom.png` });
// Play at 8x to the end, then press Esc.
await page.evaluate(() => { const s = window.game.scene.getScene('ReplayScene'); s.seek(s.end - 30); s.setSpeed(8); s.setPlaying(true); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/replay_end.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
const back = await page.evaluate(() => window.game.scene.getScene('StartScene').sys.isActive() && !document.querySelector('.replay-hud'));
console.log(JSON.stringify({ end, spot, backToStart: back, errors }, null, 1));
await browser.close();
