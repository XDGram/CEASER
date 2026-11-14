// Captures the remaining app screens at 2x with element boxes. Makes one real testnet lock with the demo account.
const { chromium } = require('playwright');
const fs = require('fs');
const [state, out] = process.argv.slice(2);
const SITE = 'https://ceaser-nine.vercel.app';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: state });
  await ctx.addInitScript(() => { try { localStorage.setItem('ceaser:activity-muted', '1'); } catch {} });
  const p = await ctx.newPage();
  const hide = () => p.addStyleTag({ content: 'button[title*="activity" i] { display:none !important }' }).catch(() => {});
  const go = async (path) => { await p.goto(SITE + path, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(3500); await hide(); };
  const box = async (loc) => { try { const r = await loc.first().boundingBox({ timeout: 5000 }); const sy = await p.evaluate(() => scrollY); return r && { x: Math.round(r.x), y: Math.round(r.y + sy), w: Math.round(r.width), h: Math.round(r.height) }; } catch { return null; } };
  const B = {};
  const step = async (name, fn) => { try { await fn(); console.log('ok', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };

  await step('lock', async () => {
    await go('/app/locks');
    if (await p.getByRole('button', { name: /exit/i }).count() === 0) {
      await go('/app/lock');
      await p.getByPlaceholder('100000').fill('100000');
      const sel = p.getByText('None', { exact: true }).first(); await sel.click(); await p.waitForTimeout(500);
      const opt = p.getByText(/^#\d+ · /).first(); console.log('joining', await opt.textContent()); await opt.click(); await p.waitForTimeout(500);
      await p.getByRole('button', { name: 'Lock tokens' }).click();
      await p.waitForURL(/locks|lock/, { timeout: 60000 }); await p.waitForTimeout(12000);
      await go('/app/locks');
    }
    await p.screenshot({ path: `${out}/locks.png`, fullPage: true });
    B.locks = { exitBtn: await box(p.locator('button.btn-danger')), card: await box(p.locator('button.btn-danger').locator('xpath=ancestor::div[contains(@class,"card")][1]')) };
    await p.locator('button.btn-danger').first().click();
    await p.getByText('You get back').waitFor({ timeout: 30000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/exit-dialog.png` });
    B.exit = { dialog: await box(p.locator('[role="dialog"]')), back: await box(p.getByText('You get back')), btn: await box(p.locator('[role="dialog"] button.btn-danger')) };
  });
  await step('community', async () => {
    await go('/app/c/diamond-hands');
    await p.screenshot({ path: `${out}/community.png`, fullPage: true });
    B.community = { title: await box(p.getByText('Diamond Hands DAO')), members: await box(p.getByText(/members holding/)), stats: await box(p.getByText('Committed', { exact: false })),
      announce: await box(p.getByText('Pinned announcement', { exact: false })), composer: await box(p.getByPlaceholder('Why this holds. Make the case.')), post: await box(p.getByRole('button', { name: /Post/ })),
      achievements: await box(p.getByText('Recent achievements', { exact: false })) };
  });
  await step('communities', async () => {
    await go('/app/communities');
    await p.getByRole('button', { name: 'NEAR backing' }).click(); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/communities-near.png`, fullPage: true });
    B.communities = { board: await box(p.getByText('Leaderboard')), tab: await box(p.getByRole('button', { name: 'NEAR backing' })) };
  });
  await step('profile', async () => {
    const acct = JSON.parse(fs.readFileSync(state)).origins.flatMap((o) => o.localStorage).find((x) => x.name === 'ceaser:demo-account');
    const id = JSON.parse(acct.value).accountId;
    await go('/app/u/' + id);
    await p.locator('#near-backing').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
    await p.locator('#near-backing').screenshot({ path: `${out}/near-backing.png` });
  });
  await step('near-core', async () => {
    await go('/');
    await p.evaluate(() => document.querySelector('#near').scrollIntoView()); await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/landing-near.png` });
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/landing-hero.png` });
  });
  await step('challenge', async () => {
    await go('/app/challenges/4');
    await p.screenshot({ path: `${out}/challenge.png`, fullPage: true });
  });
  fs.writeFileSync(`${out}/rest-boxes.json`, JSON.stringify(B, null, 1));
  console.log(JSON.stringify(B));
  await b.close();
})();
