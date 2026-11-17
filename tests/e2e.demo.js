/* Browser test of the demo-mode UI flows.
   Serve the folder (e.g. `npx serve .` or `python3 -m http.server 8765`) then:
   node tests/e2e.demo.js http://localhost:8765            (needs `playwright`) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8765';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'iphone' }]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => errors.push(vp.name + ': ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
    await page.goto(BASE + '/index.html#/clubhouse');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.standings tbody tr');
    const pts = async () => page.$$eval('.standings tbody tr', (rows) => rows.map((r) => r.querySelector('.name').textContent + ':' + r.querySelector('.pts-box').textContent));
    assert.deepStrictEqual(await pts(), ['Jones:7', 'Fitz:5', 'Pirie:3', 'Forrest:1']);

    // --- submit Round 05 (Jones & Pirie v Fitz & Forrest), Fitz & Forrest win 80-76, plus a fine
    await page.click(vp.width < 700 ? '.tab-submit' : '.btn-submit');
    await page.waitForSelector('#srRound');
    const opts = await page.$$eval('#srRound option', (o) => o.map((x) => x.textContent));
    assert.ok(opts[0].startsWith('Round 05'), 'first open round preselected');
    assert.ok(!opts.some((o) => o.startsWith('Round 04')), 'completed round not offered (duplicate prevention)');
    await page.fill('#srCourse', 'Lake Karrinyup');
    await page.click('#srNext'); // invalid: no scores
    assert.ok(await page.$('#srA.invalid'), 'validation flags missing score');
    await page.fill('#srA', '80');
    await page.fill('#srB', '76');
    assert.match(await page.textContent('#pv'), /Fitz & Forrest win by 4 strokes/);
    await page.click('#srAddFine');
    await page.selectOption('.fine-line [data-fk=playerId]', 'pirie');
    await page.click('#srNext');
    await page.waitForSelector('#srSave');
    assert.match(await page.textContent('.modal'), /Confirm result/);
    await page.click('#srSave');
    await page.waitForSelector('#modalRoot[hidden]', { state: 'attached' });
    await page.waitForTimeout(500);
    assert.deepStrictEqual(await pts(), ['Jones:7', 'Fitz:7', 'Pirie:3', 'Forrest:3']);
    assert.match(await page.textContent('.latest-card'), /Round 05/);
    assert.match(await page.textContent('.latest-card'), /Fitz & Forrest win/);
    assert.match(await page.textContent('.hero-meta'), /05 \/ 12/);
    const shared = await page.$$eval('.rank-num', (r) => r.map((x) => x.textContent));
    // Jones & Fitz: 7 pts, 3 wins, +10 differential each -> shared 1st; Pirie & Forrest identical -> shared 3rd
    assert.deepStrictEqual(shared, ['1=', '1=', '3=', '3=']);
    // chart markers follow the data
    await page.waitForTimeout(1200);
    const labels = await page.$$eval('.marker-label', (l) => l.map((x) => x.textContent));
    assert.ok(labels.some((t) => /FITZ.*7 PTS/i.test(t)), 'marker label updated: ' + labels);
    // markers sit on line endpoints, no overlapping labels
    const boxes = await page.$$eval('.marker-label', (l) => l.map((x) => x.getBoundingClientRect()).map((r) => [r.top, r.bottom]));
    boxes.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i][0] >= boxes[i - 1][1] - 0.5, 'labels overlap');

    // --- edit Round 01 (flip it) through the fixture modal, standings recalc
    await page.goto(BASE + '/index.html#/fixtures');
    await page.click('[data-fixture="demo-fx-1"]');
    await page.click('#fxRes');
    await page.fill('#srA', '90');
    await page.fill('#srB', '70');
    await page.click('#srNext');
    await page.click('#srSave');
    await page.waitForTimeout(600);
    await page.goto(BASE + '/index.html#/clubhouse');
    await page.waitForSelector('.standings tbody tr');
    const after = await pts();
    const map = Object.fromEntries(after.map((s) => s.split(':')));
    assert.deepStrictEqual(map, { Jones: '5', Fitz: '5', Pirie: '5', Forrest: '5' }, JSON.stringify(after));

    // --- fines are independent: pot now has 7 offences, points unchanged
    await page.goto(BASE + '/index.html#/fines');
    assert.match(await page.textContent('.fines-hero-stats'), /7 offences/);
    await page.click('[data-toggle-paid]');
    await page.waitForTimeout(500);
    await page.goto(BASE + '/index.html#/clubhouse');
    await page.waitForSelector('.standings tbody tr');
    assert.deepStrictEqual(Object.fromEntries((await pts()).map((s) => s.split(':'))), map);

    // --- every page renders without horizontal overflow
    for (const r of ['clubhouse', 'fixtures', 'players', 'players/pirie', 'fines', 'records']) {
      await page.goto(BASE + '/index.html#/' + r);
      await page.waitForTimeout(300);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(ov <= 0, vp.name + ' overflow on ' + r + ': ' + ov);
    }
    console.log('  ✓ ' + vp.name + ' flows passed');
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('E2E demo tests passed');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
