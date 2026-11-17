/* Browser test of the whole site in demo mode (desktop + iPhone widths). No logins anywhere.
   Serve the folder (python3 -m http.server 8765), then:
   node tests/e2e.demo.js http://localhost:8765            (needs `playwright`)
   Uses ?demo so it never touches the real database, whatever config.js says. */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = (process.argv[2] || 'http://localhost:8765') + '/index.html?demo';
const SHOTS = process.env.DD_SHOTS || '';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'iphone' }]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => errors.push(vp.name + ': ' + e.message));
    const shot = async (n, full) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + vp.name + '-' + n + '.png', fullPage: !!full }); };
    const go = async (hash, sel) => { await page.goto(BASE + '#/' + hash); await page.waitForSelector(sel); };
    const pts = async () => { await go('clubhouse', '.standings tbody tr'); return page.$$eval('.standings tbody tr', (rows) => Object.fromEntries(rows.map((r) => [r.querySelector('.name').textContent, +r.querySelector('.pts-box').textContent]))); };
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dd-demo-data-v3')));
    const submitBtn = vp.width < 700 ? '.tab-submit' : '.btn-submit';

    await page.goto(BASE + '#/clubhouse'); await page.evaluate(() => localStorage.clear()); await page.reload();
    assert.deepStrictEqual(await pts(), { Jones: 7, Fitz: 5, Pirie: 3, Forrest: 1 });

    // --- four sections, no Tee Sheet, no Records, no login anywhere
    const nav = await page.$$eval(vp.width < 980 ? '.tabbar a' : '.main-nav a', (a) => a.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(nav, ['Clubhouse', 'Fixtures', 'Players', 'Fines']);
    assert.ok(!/sign in|log ?in|password/i.test(await page.textContent('body')), 'no login wording on the page');
    for (const gone of ['records', 'tee-sheet']) { await page.goto(BASE + '#/' + gone); await page.waitForSelector('.standings'); assert.match(await page.textContent('.hero'), /The Clubhouse/); }
    await page.waitForTimeout(900); await shot('1-clubhouse', true);

    // --- submit a result in one screen: round, course, date, two scores, submit
    await page.click(submitBtn); await page.waitForSelector('#srRound');
    const opts = await page.$$eval('#srRound option', (o) => o.map((x) => x.textContent));
    assert.ok(opts[0].startsWith('Round 05'), 'next unplayed round preselected');
    assert.ok(!opts.some((o) => /Round 0[1-4]/.test(o)), 'played rounds are not offered (duplicate protection)');
    assert.strictEqual(await page.$('#siEmail'), null, 'no sign-in step');
    await page.click('#srSave');
    assert.ok(await page.$('#srA.invalid'), 'missing score is flagged');
    await page.fill('#srCourse', 'Lake Karrinyup'); await page.fill('#srA', '80'); await page.fill('#srB', '76');
    assert.match(await page.textContent('#pv'), /Fitz & Forrest win by 4 strokes/);
    await shot('2-submit');
    await page.click('#srSave');
    await page.waitForFunction(() => document.querySelector('.latest-card') && /Round 05/.test(document.querySelector('.latest-card').textContent));
    assert.match(await page.textContent('.latest-card'), /Fitz & Forrest win/);
    assert.match(await page.textContent('.hero-meta'), /05 \/ 12/);
    assert.deepStrictEqual(await pts(), { Jones: 7, Fitz: 7, Pirie: 3, Forrest: 3 });
    await page.waitForTimeout(1100);
    assert.ok((await page.$$eval('.marker-label', (l) => l.map((x) => x.textContent))).some((t) => /FITZ.*7 PTS/i.test(t)), 'Championship Race chart updated');
    assert.strictEqual((await stored()).fixtures.filter((f) => f.status === 'completed').length, 5);

    // --- a bot filling the hidden field saves nothing
    await page.click(submitBtn); await page.waitForSelector('#srRound');
    await page.fill('#srCourse', 'Spam Links'); await page.fill('#srA', '70'); await page.fill('#srB', '71');
    await page.evaluate(() => { document.querySelector('.modal .hp').value = 'http://spam.example'; });
    await page.click('#srSave'); await page.waitForTimeout(500);
    assert.strictEqual((await stored()).fixtures.filter((f) => f.status === 'completed').length, 5, 'honeypot submission ignored');

    // --- correct an earlier result: everything after it recalculates
    await go('fixtures', '.fixture');
    assert.strictEqual(await page.$$eval('.fixture', (f) => f.length), 12);
    await page.click('[data-fixture="demo-fx-1"]'); await page.click('#fxRes');
    await page.fill('#srA', '90'); await page.fill('#srB', '70'); await page.click('#srSave');
    await page.waitForSelector('.standings');
    assert.deepStrictEqual(await pts(), { Jones: 5, Fitz: 5, Pirie: 5, Forrest: 5 });
    // --- delete a result entered by mistake
    await go('fixtures', '.fixture'); await page.click('[data-fixture="demo-fx-5"]'); await page.click('#fxDel'); await page.click('#cfOk');
    await page.waitForFunction(() => /Up next/i.test(document.querySelector('[data-fixture="demo-fx-5"]').textContent));
    assert.deepStrictEqual(await pts(), { Jones: 5, Fitz: 3, Pirie: 5, Forrest: 3 });
    // --- change a round's date and course
    await go('fixtures', '.fixture'); await page.click('[data-fixture="demo-fx-6"]'); await page.click('#fxEdit');
    await page.fill('#feCourse', 'Secret Harbour'); await page.click('#feSave');
    await page.waitForFunction(() => /Secret Harbour/.test(document.querySelector('[data-fixture="demo-fx-6"]').textContent));

    // --- fines: pick a player, pick an offence, submit
    await go('fines', '.fines-hero-stats');
    assert.match(await page.textContent('.fines-hero-stats'), /6 offences/);
    const before = await pts(); await go('fines', '.fines-hero-stats');
    await page.click('[data-action="add-fine"]'); await page.waitForSelector('.pick');
    await page.click('#fnSave');
    assert.match(await page.textContent('#fnPErr'), /Choose who/);
    await page.click('.pick-item:has(input[value="jones"])');
    await page.selectOption('#fnC', { label: 'No-show — $20' });
    await shot('3-fine');
    await page.click('#fnSave');
    await page.waitForFunction(() => /7 offences/.test(document.querySelector('.fines-hero-stats').textContent));
    assert.match(await page.textContent('.fines-hero-stats'), /\$46/);
    // the same fine again straight away is treated as a double tap
    await page.click('[data-action="add-fine"]'); await page.click('.pick-item:has(input[value="jones"])'); await page.selectOption('#fnC', { label: 'No-show — $20' }); await page.click('#fnSave');
    await page.waitForSelector('.toast.error');
    assert.match(await page.textContent('.toast.error'), /not adding it twice/);
    await page.click('.modal [data-close]');
    assert.strictEqual((await stored()).fines.length, 7);
    // correct it, mark it paid, then delete it
    await page.click('[data-edit-fine]'); await page.waitForSelector('#fnA'); await page.fill('#fnA', '15'); await page.click('#fnSave');
    await page.waitForFunction(() => /\$41/.test(document.querySelector('.fines-hero-stats').textContent));
    await page.click('[data-toggle-paid]');
    await page.waitForFunction(() => /Paid/.test(document.querySelector('[data-toggle-paid]').textContent));
    await page.click('[data-del-fine]'); await page.click('#cfOk');
    await page.waitForFunction(() => /6 offences/.test(document.querySelector('.fines-hero-stats').textContent));
    assert.deepStrictEqual(await pts(), before, 'fines never change championship points');

    // --- profiles: biography, results history, fines
    await go('players/fitz', '.profile-hero');
    assert.match(await page.textContent('.profile-hero'), /nine putters/);
    assert.match(await page.textContent('#app'), /Match History/); assert.match(await page.textContent('#app'), /Partner Chemistry/); assert.match(await page.textContent('#app'), /Disciplinary Record/);
    // --- refresh keeps everything; no page scrolls sideways
    await page.reload(); await page.waitForSelector('.profile-hero');
    assert.strictEqual((await stored()).fixtures[0].scoreA, 90);
    for (const r of ['clubhouse', 'fixtures', 'players', 'players/pirie', 'fines']) {
      await page.goto(BASE + '#/' + r); await page.waitForTimeout(300);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(ov <= 0, vp.name + ' overflow on ' + r + ': ' + ov);
    }
    await shot('4-fines', true);
    console.log('  ✓ ' + vp.name + ' flows passed');
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Demo browser tests passed');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
