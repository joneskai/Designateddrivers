/* Edge cases found in the full-site review (demo mode, desktop + iPhone widths).
   Serve the folder (python3 -m http.server 8765), then:
   node tests/e2e.review.js http://localhost:8765 */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const T = require('../teetime.js');
const BASE = (process.argv[2] || 'http://localhost:8765') + '/index.html?demo';
const TODAY = T.today('Australia/Perth');
const KEY = 'dd-demo-data-v5';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'iphone' }]) {
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(vp.name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(vp.name + ' console: ' + m.text()); });
    const phone = vp.width < 700;
    const text = (sel) => page.textContent(sel);
    const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    const patch = async (fn) => { await page.evaluate(([k, src]) => { const d = JSON.parse(localStorage.getItem(k)); (new Function('d', src))(d); localStorage.setItem(k, JSON.stringify(d)); }, [KEY, fn]); await page.reload(); };
    const go = async (hash, sel) => { await page.goto(BASE + '#/' + hash); await page.waitForSelector(sel); };
    const fresh = async () => { await page.goto(BASE + '#/clubhouse'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.standings'); };
    const openRecord = async () => { if (phone) { await page.click('.tab-submit'); await page.click('[data-act="record"]'); } else await page.click('.btn-submit'); await page.waitForSelector('#srSave'); };
    const pts = async () => { await page.goto(BASE + '#/clubhouse'); await page.reload(); await page.waitForSelector('.standings tbody tr'); return page.$$eval('.standings tbody tr', (r) => Object.fromEntries(r.map((x) => [x.querySelector('.name').textContent, +x.querySelector('.pts-box').textContent]))); };
    const modalFits = async (where) => { const ov = await page.evaluate(() => { const m = document.querySelector('.modal'); return m ? m.scrollWidth - m.clientWidth : 0; }); assert.ok(ov <= 1, vp.name + ' modal scrolls sideways at ' + where + ': ' + ov); };

    // ---------- results: validation, draw, double tap, future date
    await fresh();
    const before = await pts();
    await openRecord(); await modalFits('submit');
    await page.fill('#srCourse', 'Wembley');
    for (const [a, b, msg] of [['17', '80', /Whole number between 18 and 200/], ['80', '201', /Whole number between 18 and 200/], ['79.5', '80', /Whole number/]]) {
      await page.fill('#srA', a); await page.fill('#srB', b); await page.click('#srSave');
      assert.match(await text('.modal'), msg, a + '/' + b);
    }
    await page.fill('#srDate', T.addDays(TODAY, 2)); await page.fill('#srA', '80'); await page.fill('#srB', '80'); await page.click('#srSave');
    assert.match(await text('[data-err="date"]'), /future date/);
    await page.fill('#srDate', TODAY);
    assert.match(await text('#pv'), /All square on 80 — a draw/);
    await page.evaluate(() => { const b = document.querySelector('#srSave'); b.click(); b.click(); b.click(); });   // triple tap
    await page.waitForFunction(() => /Round 05/.test((document.querySelector('.latest-card') || {}).textContent || ''));
    const st = await stored();
    assert.strictEqual(st.fixtures.filter((f) => f.status === 'completed').length, 5, 'saved exactly once');
    const after = await pts();
    ['Jones', 'Fitz', 'Pirie', 'Forrest'].forEach((p) => assert.strictEqual(after[p], before[p] + 1, 'draw = +1 each for ' + p));

    // ---------- a played round: no stray "Date & course" (Edit result has both), and the edit works
    await go('fixtures', '.fixture'); await page.click('[data-fixture="demo-fx-5"]');
    assert.strictEqual(await page.$('#fxEdit'), null, 'no Date & course button on a played round');
    await page.click('#fxRes'); await page.fill('#srCourse', 'Lake Karrinyup'); await page.fill('#srDate', T.addDays(TODAY, -1)); await page.fill('#srA', '75'); await page.click('#srSave');
    await page.waitForSelector('#modalRoot[hidden]', { state: 'attached' }); await page.waitForTimeout(500);
    let f5 = (await stored()).fixtures[4];
    assert.deepStrictEqual([f5.course, f5.date, f5.scoreA], ['Lake Karrinyup', T.addDays(TODAY, -1), 75]);
    // ---------- deleting it puts the round back with no date (it never had a planned one)
    await go('fixtures', '.fixture'); await page.click('[data-fixture="demo-fx-5"]'); await page.click('#fxDel');
    assert.match(await text('.modal'), /standings and Championship Race are recalculated/);
    await page.click('#cfOk'); await page.waitForTimeout(500);
    f5 = (await stored()).fixtures[4];
    assert.strictEqual(f5.date, null, 'deleting a result does not leave the played date behind');
    assert.deepStrictEqual(await pts(), before);
    await go('tee-time', '.tee-next');
    assert.ok(!(await page.$('.tee-locked')), 'Round 05 is not treated as locked in after its result is deleted');
    assert.match(await text('.tee-next'), /Round 05/);

    // ---------- a date set on Fixtures locks the round in; once that date passes Tee Time asks for the result
    await go('fixtures', '.fixture'); await page.click('[data-fixture="demo-fx-5"]'); await page.click('#fxEdit');
    await page.fill('#feDate', T.addDays(TODAY, -1)); await page.fill('#feCourse', 'Wembley Golf Course'); await page.click('#feSave');
    await page.waitForTimeout(400);
    await go('tee-time', '.tee-locked');
    assert.match(await text('.tee-locked'), /Round 05/); assert.match(await text('.tee-locked'), /Date set on Fixtures/);
    assert.match(await text('.tee-locked'), /That date has passed/);
    assert.match(await text('.tee-next:not(.tee-locked)'), /Round 06/);
    await page.click('.tee-locked [data-tee="record"]'); await page.waitForSelector('#srSave');
    assert.strictEqual(await page.$eval('#srRound', (s) => s.value), 'demo-fx-5');
    assert.strictEqual(await page.inputValue('#srDate'), T.addDays(TODAY, -1), 'defaults to the date it was set for');
    await page.fill('#srA', '81'); await page.fill('#srB', '79'); await page.click('#srSave');
    await page.waitForSelector('#modalRoot[hidden]', { state: 'attached' }); await page.waitForTimeout(500);
    await go('tee-time', '.tee-next');
    assert.ok(!(await page.$('.tee-locked')));
    assert.match(await text('.tee-next'), /Round 06/);
    assert.match(await text('.tee-next'), new RegExp('Last round: ' + T.shortDate(T.addDays(TODAY, -1)) + ' \\(Round 05\\)'));

    // ---------- an open proposal whose date has gone by is flagged
    await fresh();
    await patch(`d.proposals.push({ id: 'p-old', fixtureId: 'demo-fx-5', date: '${T.addDays(TODAY, -3)}', slot: 0, status: 'open', proposedBy: 'jones', teeTime: null, course: '', createdAt: '', responses: { jones: 'yes' } });`);
    await go('tee-time', '.tn-box.proposed');
    assert.match(await text('.tn-box'), /That date has passed without everyone confirming/);
    await page.click('.tn-box [data-tee="withdraw"]'); await page.click('#cfOk');
    await page.waitForFunction(() => !document.querySelector('.tn-box.proposed'));

    // ---------- switching name mid-save sends each tap to the right player
    const W = T.windowFor({ lastPlayed: '2026-11-15', today: TODAY }).weekends;
    await page.click('label.tee-radio:has(input[value="jones"])');
    await page.click(`[data-tee="cell"][data-w="${W[2]}"][data-d="0"][data-s="0"]`);
    await page.click('label.tee-radio:has(input[value="fitz"])');               // straight away, before the save
    await page.click(`[data-tee="cell"][data-w="${W[2]}"][data-d="2"][data-s="4"]`);
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#teeSave').textContent));
    await page.waitForTimeout(600);
    const av = (await stored()).availability.filter((a) => a.weekend === W[2]);
    assert.deepStrictEqual(av.map((a) => [a.playerId, a.mask]).sort(), [['fitz', T.bit(2, 4)], ['jones', T.bit(0, 0)]]);
    await modalFits('tee');

    // ---------- fines: retire an offence, then bring it back by name
    await go('fines', '.tariff');
    assert.strictEqual(await page.$$eval('.tariff-item', (t) => t.length), 5);
    await page.click('[data-action="add-category"]'); await page.fill('#ctN', 'Three-putt'); await page.fill('#ctA', '2'); await page.click('#ctSave');
    await page.waitForFunction(() => document.querySelectorAll('.tariff-item').length === 6);
    const catId = (await stored()).fineCategories.find((c) => c.name === 'Three-putt').id;
    await page.click(`[data-edit-cat="${catId}"]`); await page.uncheck('#ctActive'); await page.click('#ctSave');
    await page.waitForFunction(() => document.querySelectorAll('.tariff-item').length === 5);
    await page.click('[data-action="add-category"]'); await page.fill('#ctN', 'three-putt'); await page.fill('#ctA', '3'); await page.click('#ctSave');
    await page.waitForFunction(() => document.querySelectorAll('.tariff-item').length === 6);
    assert.match(await text('.toast:last-child'), /“Three-putt” is back on the tariff/);
    const cats = (await stored()).fineCategories.filter((c) => /three-putt/i.test(c.name));
    assert.strictEqual(cats.length, 1, 'no duplicate offence'); assert.strictEqual(cats[0].amount, 3);
    // a real duplicate is still refused
    await page.click('[data-action="add-category"]'); await page.fill('#ctN', 'No-show'); await page.click('#ctSave');
    assert.match(await text('#ctErr'), /already exists/); await page.click('.modal [data-close]');
    // fine on a paid toggle and back, amounts in the pot
    await page.click('[data-action="add-fine"]'); await page.click('.pick-item:has(input[value="fitz"])');
    await page.selectOption('#fnC', { label: 'Three-putt — $3' }); await page.click('#fnSave');
    await page.waitForFunction(() => /\$27/.test(document.querySelector('.fines-hero-stats').textContent));
    // a fine's amount can't go above $500 or below $0
    await page.click('[data-edit-fine]'); await page.fill('#fnA', '501'); await page.click('#fnSave');
    assert.match(await text('#fnAErr'), /between \$0 and \$500/); await modalFits('fine'); await page.click('.modal [data-close]');

    // ---------- swap two unplayed rounds' pairings: season stays balanced, played rounds aren't offered
    await go('fixtures', '.fixture');
    const r6 = (await stored()).fixtures[5], r7 = (await stored()).fixtures[6];
    await page.click('[data-fixture="demo-fx-6"]'); await page.click('#fxSwap');
    const offered = await page.$$eval('#swWith option', (o) => o.map((x) => x.value));
    assert.ok(!offered.some((v) => ['demo-fx-1', 'demo-fx-2', 'demo-fx-3', 'demo-fx-4'].includes(v)), 'played rounds not offered');
    await page.selectOption('#swWith', 'demo-fx-7'); await page.click('#swGo');
    await page.waitForTimeout(500);
    const after6 = (await stored()).fixtures[5], after7 = (await stored()).fixtures[6];
    assert.deepStrictEqual([after6.teamA, after7.teamA], [r7.teamA, r6.teamA]);
    assert.match(await text('.balance-note'), /Partnerships balanced/);
    // ---------- links: Key Stats -> Fines, hero "Find a date" -> Tee Time, standings row -> profile
    await go('clubhouse', '.stat');
    await page.click('a.stat[href="#/fines"]'); await page.waitForSelector('.fines-hero-stats');
    await go('clubhouse', '.hero-meta');
    if (await page.$('.meta-link')) { await page.click('.meta-link'); await page.waitForSelector('.tee-next'); }
    await go('clubhouse', '.standings tbody tr'); await page.click('.standings tbody tr'); await page.waitForSelector('.profile-hero');
    await page.waitForSelector('#pChart');

    // ---------- the + sheet at the end of a season, Escape closes dialogs, demo reset
    if (phone) {
      await patch(`d.fixtures.forEach((f, i) => { if (f.status !== 'completed') { f.status = 'completed'; f.scoreA = 80; f.scoreB = 82; f.date = '2026-11-01'; } });`);
      await go('clubhouse', '.standings');
      await page.click('.tab-submit');
      assert.match(await text('[data-act="record"]'), /Correct a result from Fixtures/);
      assert.ok(await page.$('[data-act="schedule"][disabled]'), 'Schedule Fixture disabled once every round is played');
      await page.keyboard.press('Escape'); await page.waitForSelector('#modalRoot[hidden]', { state: 'attached' });
      await go('tee-time', '.empty'); assert.match(await text('#app'), /Season complete/);
    }
    await go('clubhouse', '.standings');
    await page.click('[data-action="reset-demo"]'); await page.click('#cfOk');
    await page.waitForTimeout(600);
    assert.strictEqual((await stored()).fixtures.filter((f) => f.status === 'completed').length, 4, 'demo reset restores the demo season');
    console.log('  ✓ ' + vp.name + ' review checks passed');
    await context.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Review checks passed');
})().catch((e) => { console.error('REVIEW CHECK FAILED:', e.message); process.exit(1); });
