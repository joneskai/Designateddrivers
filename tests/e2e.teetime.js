/* Browser test of the Tee Time tab in demo mode (desktop + iPhone widths).
   Serve the folder (python3 -m http.server 8765), then:
   node tests/e2e.teetime.js http://localhost:8765            (needs `playwright`) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const T = require('../teetime.js');
const ROOT = process.argv[2] || 'http://localhost:8765';
const BASE = ROOT + '/index.html?demo';
const SHOTS = process.env.DD_SHOTS || '';
const TODAY = T.today('Australia/Perth');
const W = T.windowFor({ lastPlayed: '2026-11-15', today: TODAY }).weekends;   // demo: Round 04 was Sun 15 Nov
const SAT = 1, SUN = 2, EA = 0, LA = 1;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'iphone' }]) {
    const ctxB = await browser.newContext({ viewport: vp });
    const page = await ctxB.newPage();
    page.on('pageerror', (e) => errors.push(vp.name + ': ' + e.message));
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + vp.name + '-' + n + '.png', fullPage: true }); };
    const text = (sel) => page.textContent(sel);
    const cell = (w, d, s) => `[data-tee="cell"][data-w="${w}"][data-d="${d}"][data-s="${s}"]`;
    const pick = async (who) => { await page.click(`label.tee-radio:has(input[value="${who}"])`); await page.waitForFunction((w) => document.querySelector('.tee-editing').textContent.toLowerCase().includes(w), who); };
    const saved = () => page.waitForFunction(() => /Saved/.test((document.querySelector('#teeSave') || {}).textContent || ''), null, { timeout: 5000 });
    const fresh = async () => { await page.goto(BASE + '#/clubhouse'); await page.evaluate(() => localStorage.clear()); await page.goto(BASE + '#/tee-time'); await page.reload(); await page.waitForSelector('.tee-next'); };
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dd-demo-data-v5')));
    const overflow = async (where) => { const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 0, vp.name + ' overflow at ' + where + ': ' + ov); };

    // ---------- 1. the tab, the next fixture, the 21-day window
    await fresh();
    const nav = await page.$$eval(vp.width < 980 ? '.tabbar a' : '.main-nav a', (a) => a.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(nav, ['Clubhouse', 'Fixtures', 'Tee Time', 'Players']);
    const phone = vp.width < 700;
    const menu = async (act) => { await page.click('.tab-submit'); await page.click(`[data-act="${act}"]`); };
    assert.match(await text('.tee-next'), /Round 05/);
    assert.match(await text('.tee-next'), /Jones & Pirie v Fitz & Forrest/);
    assert.match(await text('.tee-next'), /Last round: Sun 15 Nov \(Round 04\)/);
    const weeks = await page.$$eval('.tw-dates', (d) => d.map((x) => x.textContent));
    assert.deepStrictEqual(weeks, W.map(T.weekendLabel), 'four weekends from the eligible Friday');
    assert.match(await text('.tee-note'), new RegExp('opens the weekend of ' + T.shortDate(W[0])));
    // nobody picked yet: group counts, no editing
    assert.match(await text('.tee-editing'), /Who are you\?/);
    assert.strictEqual(await page.$('[data-tee="cell"]'), null);
    assert.match(await page.textContent(cell(W[0], SAT, EA).replace('[data-tee="cell"]', '.tw-cell') ), /3\/4/);

    // ---------- 2. three available, one not answered -> alternative only, never recommended
    assert.match(await text('.tn-box'), /No time works for all four yet/);
    assert.match(await text('.tn-box'), /Waiting on Forrest to fill in availability/);
    assert.ok(!/Propose round/.test(await text('.tee-next')));
    assert.match(await text('.ov-row'), new RegExp(T.shortDate(T.addDays(W[0], 1)) + ' · Early AM · 3/4'));
    assert.match(await text('.ov-row'), /awaiting Forrest/, 'a missing reply is "awaiting", not "can\'t"');
    await shot('1-start');

    // ---------- 3. Forrest picks his name and taps; the fourth tick makes it 4/4
    await pick('forrest');
    assert.match(await text('.tee-week'), /Not answered yet/);
    const forrestAv = `.tee-week:first-child .tw-av:has(img[alt="Forrest"])`;
    assert.ok(!(await page.$(forrestAv + '.in')), 'greyed before answering');
    // tick then untick: no times selected -> his icon goes back to grey
    await page.click(cell(W[0], SAT, LA)); await saved();
    assert.ok(await page.$(forrestAv + '.in'), 'coloured with a time ticked');
    await page.click(cell(W[0], SAT, LA)); await saved();
    assert.ok(!(await page.$(forrestAv + '.in')), 'grey again once nothing is ticked');
    assert.strictEqual(await page.getAttribute(forrestAv, 'title'), 'Forrest: no response yet');
    assert.match(await text('.tee-week:first-child'), /Not answered yet/, 'unticking everything is not an answer');
    // "Can't make it" IS an answer: green, and the weekend counts as answered
    await page.click(`[data-tee="week"][data-w="${W[0]}"][data-v="none"]`); await saved();
    assert.ok(await page.$(forrestAv + '.in'), 'green after Can’t make it');
    assert.strictEqual(await page.getAttribute(forrestAv, 'title'), 'Forrest can’t make this weekend');
    assert.match(await text('.tee-week:first-child'), /You can’t make this weekend/);
    assert.strictEqual(await page.$$eval(`[data-tee="cell"][data-w="${W[0]}"].no`, (c) => c.length) + await page.$$eval(`[data-tee="cell"][data-w="${W[0]}"].past`, (c) => c.length), 15);
    await page.reload(); await page.waitForSelector('.tee-next');
    assert.ok(await page.$(forrestAv + '.in'), 'still green after refresh');
    await page.click(cell(W[0], SAT, EA));
    await saved();
    assert.ok(await page.$(forrestAv + '.in'));
    assert.match(await text('.tn-box.best'), /Best next time/);
    assert.match(await text('.tn-box.best'), new RegExp(T.shortDate(T.addDays(W[0], 1)) + ' · Early AM'));
    assert.match(await text('.tn-box.best'), /4\/4 available/);
    assert.ok(await page.$('.tee-week.best'), 'the week with the best time is highlighted');
    // the rest of that weekend is now a confirmed "no" for Forrest
    assert.ok(await page.$(cell(W[0], SUN, LA) + '.no'));
    assert.match(await text('.ov-list'), /Sun 6 Dec · Late AM · 3\/4|· 3\/4/);
    assert.match(await page.$$eval('.ov-note', (n) => n.map((x) => x.textContent).join('|')), /Forrest can’t/);
    await overflow('after first tick'); await shot('2-best');

    // ---------- 4. bulk actions + undo, tapping a whole day
    await page.click(`[data-tee="week"][data-w="${W[2]}"][data-v="all"]`); await saved();
    assert.strictEqual(await page.$$eval(`[data-tee="cell"][data-w="${W[2]}"].yes`, (c) => c.length), 15);
    await page.click(`[data-tee="week"][data-w="${W[2]}"][data-v="none"]`);
    assert.strictEqual(await page.$$eval(`[data-tee="cell"][data-w="${W[2]}"].yes`, (c) => c.length), 0);
    await page.click('.toast-undo'); await saved();
    assert.strictEqual(await page.$$eval(`[data-tee="cell"][data-w="${W[2]}"].yes`, (c) => c.length), 15, 'undo restores the weekend');
    await page.click(`[data-tee="day"][data-w="${W[2]}"][data-d="0"]`); await saved();
    assert.strictEqual(await page.$$eval(`[data-tee="cell"][data-w="${W[2]}"][data-d="0"].yes`, (c) => c.length), 0, 'tapping a full day clears it');

    // ---------- 5. persists after refresh; player remembered on this device
    await page.reload(); await page.waitForSelector('.tee-next');
    assert.match(await text('.tee-editing'), /Forrest/);
    assert.ok(await page.$(cell(W[0], SAT, EA) + '.yes'));
    assert.strictEqual((await stored()).availability.filter((a) => a.playerId === 'forrest').length, 2);

    // ---------- 6. another device (second tab) edits the same weekend: both changes kept and visible.
    // (Truly simultaneous writes are merged by the database, bit by bit — see tests/teetime.schema.test.sql.
    //  Demo mode stores data in this browser only, so it is not meant for parallel writers.)
    const tab2 = await ctxB.newPage();
    await tab2.goto(BASE + '#/tee-time'); await tab2.waitForSelector('.tee-next');
    await tab2.click('label.tee-radio:has(input[value="pirie"])');
    await pick('fitz');
    await page.click(cell(W[3], SUN, LA)); await saved();
    await tab2.click(cell(W[3], SAT, LA)); await tab2.waitForFunction(() => /Saved/.test(document.querySelector('#teeSave').textContent));
    await page.reload(); await page.waitForSelector('.tee-next');
    assert.ok(await page.$(cell(W[3], SUN, LA) + '.yes'), 'Fitz still sees his tick after Pirie saved from the other tab');
    const st = await stored();
    assert.ok(st.availability.some((a) => a.playerId === 'fitz' && a.weekend === W[3] && a.mask === T.bit(SUN, LA)));
    assert.ok(st.availability.some((a) => a.playerId === 'pirie' && a.weekend === W[3] && a.mask === T.bit(SAT, LA)));
    await tab2.close();

    // ---------- 7. propose -> everyone confirms -> set tee time -> appears on Fixtures and Clubhouse
    await pick('jones');
    if (phone) {
      // + → Schedule Fixture goes to the same propose step for the best time
      await page.goto(BASE + '#/clubhouse'); await page.waitForSelector('.standings');
      await page.click('.tab-submit');
      assert.match(await text('[data-act="schedule"]'), /Propose .* · Early AM for Round 05 \(4\/4 free\)/);
      await page.click('[data-act="schedule"]'); await page.waitForSelector('#tpGo');
      assert.strictEqual(await page.$eval('.tabbar a.active', (a) => a.textContent.trim()), 'Tee Time');
    } else await page.click('.tn-box.best [data-tee="propose"]');
    assert.match(await text('.modal'), /You’ll be marked as in, Jones/);
    await page.click('#tpGo');
    await page.waitForSelector('.tn-box.proposed');
    assert.match(await text('.tn-box'), /Proposed round/);
    assert.match(await text('.tn-box'), /1 of 4 confirmed/);
    assert.strictEqual(await page.$('[data-tee="schedule"]'), null, 'no tee time until all four are in');
    await page.goto(BASE + '#/fixtures'); await page.waitForSelector('.fixture');
    assert.match(await text('[data-fixture="demo-fx-5"]'), /Proposed/);
    await page.goto(BASE + '#/tee-time'); await page.waitForSelector('.tn-box.proposed');
    await pick('pirie'); await page.click('[data-tee="respond"][data-r="no"]');
    await page.waitForFunction(() => /can’t make it/.test(document.querySelector('.tn-box').textContent));
    assert.ok(await page.$('.tn-box.declined'));
    await page.click('[data-tee="respond"][data-r="yes"]'); await page.waitForFunction(() => /2 of 4 confirmed/.test(document.querySelector('.tn-box').textContent));
    await pick('fitz'); await page.click('[data-tee="respond"][data-r="yes"]'); await page.waitForFunction(() => /3 of 4/.test(document.querySelector('.tn-box').textContent));
    await pick('forrest'); await page.click('[data-tee="respond"][data-r="yes"]');
    // all four in = locked in: Round 05 moves to the top and the calendar moves on to Round 06
    await page.waitForSelector('.tee-locked [data-tee="schedule"]');
    const satIso = T.addDays(W[0], 1);
    assert.match(await text('.tee-locked'), /Round 05/); assert.match(await text('.tee-locked'), /Date agreed by all four/);
    assert.match(await text('.tee-next:not(.tee-locked)'), /Round 06/);
    assert.match(await text('.tee-next:not(.tee-locked)'), new RegExp('Previous round: ' + T.shortDate(satIso) + ' \\(Round 05, date agreed\\)'));
    assert.strictEqual(await text('.tw-dates'), T.weekendLabel(T.eligibleFriday(satIso)), 'Round 06 opens three weeks after the agreed date');
    if (phone) { await page.click('.tab-submit'); assert.match(await text('[data-act="schedule"]'), /set the tee time for Round 05/); await page.click('[data-act="schedule"]'); }
    else await page.click('.tee-locked [data-tee="schedule"]');
    assert.strictEqual(await page.inputValue('#tsTime'), '07:00', 'Early AM suggests 7:00');
    await page.fill('#tsTime', '07:40'); await page.fill('#tsCourse', 'Wembley Golf Course');
    await page.click('#tsGo');
    await page.waitForFunction(() => /7:40 AM/.test(document.querySelector('.tee-locked').textContent));
    assert.match(await text('.tee-next:not(.tee-locked)'), /Round 06/, 'still planning Round 06 once the tee time is set');
    const satDate = T.shortDate(T.addDays(W[0], 1));
    assert.match(await text('.tn-box'), new RegExp('Scheduled.*' + satDate + ' · 7:40 AM'));
    assert.match(await text('.tn-box'), /Booking the course is up to you/);
    await shot('3-scheduled'); await overflow('scheduled');
    await page.goto(BASE + '#/fixtures'); await page.waitForSelector('.fixture');
    assert.strictEqual(await page.$$eval('.fixture', (f) => f.length), 12, 'no duplicate fixture');
    const r5 = await text('[data-fixture="demo-fx-5"]');
    assert.match(r5, new RegExp(satDate + ' · 7:40 AM')); assert.match(r5, /Wembley Golf Course/); assert.match(r5, /Scheduled/);
    await page.goto(BASE + '#/clubhouse'); await page.waitForSelector('.hero-meta');
    assert.match(await text('.hero-meta'), new RegExp(satDate + ' · 7:40 AM · Wembley Golf Course'));

    // ---------- 8. result entered -> Tee Time moves to Round 06 and re-applies the 21-day rule
    const played = TODAY;                                  // the submit form won't take a future date
    if (phone) await menu('record'); else await page.click('.btn-submit');
    await page.waitForSelector('#srRound');
    assert.ok((await page.$$eval('#srRound option', (o) => o.map((x) => x.textContent)))[0].startsWith('Round 05'));
    await page.fill('#srDate', played); await page.fill('#srA', '80'); await page.fill('#srB', '76'); await page.click('#srSave');
    await page.waitForFunction(() => /Round 05/.test((document.querySelector('.latest-card') || {}).textContent || ''));
    await page.goto(BASE + '#/tee-time'); await page.waitForSelector('.tee-next');
    assert.match(await text('.tee-next'), /Round 06/);
    assert.match(await text('.tee-next'), new RegExp('Last round: ' + T.shortDate(played) + ' \\(Round 05\\)'));
    const W6 = T.windowFor({ lastPlayed: played, today: TODAY }).weekends;
    assert.deepStrictEqual(await page.$$eval('.tw-dates', (d) => d.map((x) => x.textContent)), W6.map(T.weekendLabel));

    // ---------- 9. correct that result's date -> window recalculates from the corrected date
    const corrected = T.addDays(played, -9);
    await page.goto(BASE + '#/fixtures'); await page.click('[data-fixture="demo-fx-5"]'); await page.click('#fxRes');
    await page.fill('#srDate', corrected); await page.click('#srSave');
    await page.waitForSelector('.latest-card');
    await page.goto(BASE + '#/tee-time'); await page.waitForSelector('.tee-next');
    const Wc = T.windowFor({ lastPlayed: corrected, today: TODAY });
    assert.strictEqual(await text('.tw-dates'), T.weekendLabel(Wc.weekends[0]));
    // ---------- 10. delete the result -> Round 05 is back, still scheduled
    await page.goto(BASE + '#/fixtures'); await page.click('[data-fixture="demo-fx-5"]'); await page.click('#fxDel'); await page.click('#cfOk');
    await page.waitForFunction(() => /Scheduled/.test(document.querySelector('[data-fixture="demo-fx-5"]').textContent));
    await page.goto(BASE + '#/tee-time'); await page.waitForSelector('.tn-box.scheduled');
    assert.match(await text('.tee-next'), /Round 05/);
    // cancel the tee time -> fixture date cleared, availability kept
    await page.click('.tn-box [data-tee="withdraw"]'); await page.click('#cfOk');
    await page.waitForSelector('.tn-box.best');
    assert.strictEqual((await stored()).fixtures[4].date, null);
    assert.ok((await stored()).availability.length >= 9);

    // ---------- 10b. your case: lock a round in for Sun 13 Dec -> the next round's calendar opens Fri 1 Jan
    await fresh();
    const sun = T.addDays(W[1], 2);                         // Sunday of the second weekend shown
    for (const who of ['jones', 'fitz', 'pirie', 'forrest']) { await pick(who); await page.click(cell(W[1], SUN, LA)); await saved(); }
    await page.click(`.ov-row[data-w="${W[1]}"][data-d="2"][data-s="1"]`); await page.click('#tpGo');
    await page.waitForSelector('.tn-box.proposed');
    for (const who of ['jones', 'fitz', 'pirie']) { await pick(who); await page.click('[data-tee="respond"][data-r="yes"]'); await page.waitForTimeout(350); }
    await page.waitForSelector('.tee-locked');
    assert.match(await text('.tee-locked'), new RegExp('Round 05[\\s\\S]*' + T.shortDate(sun) + ' · Late AM'));
    assert.match(await text('.tee-next:not(.tee-locked)'), /Round 06/);
    const expectFri = T.eligibleFriday(sun);
    if (sun === '2026-12-13') assert.strictEqual(expectFri, '2027-01-01');
    assert.strictEqual(await text('.tw-dates'), T.weekendLabel(expectFri));
    assert.match(await text('.tee-note'), new RegExp('Round 05 is locked in for ' + T.shortDate(sun) + ', so Round 06 opens the weekend of ' + T.shortDate(expectFri)));
    // withdrawing it puts the calendar back on Round 05
    await page.click('.tee-locked [data-tee="withdraw"]'); await page.click('#cfOk');
    await page.waitForFunction(() => !document.querySelector('.tee-locked'));
    assert.match(await text('.tee-next'), /Round 05/);
    assert.strictEqual(await text('.tw-dates'), T.weekendLabel(W[0]));

    // ---------- 11. no overlap in the first four weekends -> extend by two, earlier answers kept
    await fresh();
    for (const who of ['jones', 'fitz', 'pirie', 'forrest']) {
      await pick(who);
      for (const w of W) await page.click(`[data-tee="week"][data-w="${w}"][data-v="none"]`);
      await saved();
    }
    assert.match(await text('.tn-box'), /no time all four can make/);
    await page.click('.tn-box [data-tee="extend"]');
    await page.waitForFunction(() => document.querySelectorAll('.tee-week').length === 6);
    assert.ok(await page.$(cell(W[0], SAT, EA) + '.no'), 'answers kept when the calendar grows');
    const W5 = T.addDays(W[3], 7);
    for (const who of ['jones', 'fitz', 'pirie', 'forrest']) { await pick(who); await page.click(cell(W5, SAT, LA)); await saved(); }
    assert.match(await text('.tn-box.best'), new RegExp(T.shortDate(T.addDays(W5, 1)) + ' · Late AM'));
    assert.match(await text('.tn-box.best'), /4\/4/);

    for (const r of ['clubhouse', 'fixtures', 'tee-time', 'players', 'fines']) { await page.goto(BASE + '#/' + r); await page.waitForTimeout(250); await overflow(r); }
    console.log('  ✓ ' + vp.name + ' Tee Time flows passed');
    await ctxB.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Tee Time browser tests passed');
})().catch((e) => { console.error('TEE TIME E2E FAILED:', e.message); process.exit(1); });
