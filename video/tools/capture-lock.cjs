// Captures the live Lock page at 2x (empty and filled) plus element boxes for the cursor and zooms.
// Usage (from a folder with playwright): node capture-lock.cjs <storageState.json> <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const [state, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: state });
  await ctx.addInitScript(() => { try { localStorage.setItem('ceaser:activity-muted', '1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto('https://ceaser-nine.vercel.app/app/lock', { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(3000);
  await p.addStyleTag({ content: 'button[title*="activity"], .fixed.bottom-4.left-4 { display:none !important }' });
  const box = async (loc) => { const r = await loc.first().boundingBox(); return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const boxes = {};
  const grab = async () => {
    boxes.amount = await box(p.getByPlaceholder('100000'));
    boxes.strategy = await box(p.getByText('Protect a moonbag'));
    boxes.presetMoonbag = await box(p.getByRole('button', { name: 'Moonbag', exact: true }));
    boxes.ladderTitle = await box(p.getByText('Your ladder', { exact: false }));
    boxes.addStep = await box(p.getByRole('button', { name: /Add a step/ }));
    boxes.locking = await box(p.getByText('What you are locking', { exact: false }));
    boxes.boost = await box(p.getByText('Your NEAR boost', { exact: false }));
    boxes.safety = await box(p.getByText(/Safety release: on/));
    boxes.duration = await box(p.getByText('Max duration', { exact: false }));
    boxes.lockBtn = await box(p.getByRole('button', { name: 'Lock tokens' }));
    boxes.penalty = await box(p.getByText('Early-exit penalty', { exact: false }));
    const rows = p.locator('text=/^Unlock$/');
    boxes.rows = []; for (let i = 0; i < await rows.count(); i++) boxes.rows.push(await box(rows.nth(i)));
  };
  await p.screenshot({ path: `${out}/lock-empty.png`, fullPage: true });
  await p.getByPlaceholder('100000').fill('100000');
  await p.waitForTimeout(800);
  await grab();
  await p.screenshot({ path: `${out}/lock-filled.png`, fullPage: true });
  fs.writeFileSync(`${out}/lock-boxes.json`, JSON.stringify(boxes, null, 1));
  console.log(JSON.stringify(boxes));
  await b.close();
})();
