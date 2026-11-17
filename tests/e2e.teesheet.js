/* Browser test of the whole Tee Sheet flow in demo mode (desktop + iPhone widths).
   Serve the folder (python3 -m http.server 8765), then:
   node tests/e2e.teesheet.js http://localhost:8765        (needs `playwright`) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8765';
const SHOTS = process.env.DD_SHOTS || '';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'iphone' }]) {
    const context = await browser.newContext({ viewport: vp, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(vp.name + ': ' + e.message));
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + vp.name + '-' + n + '.png', fullPage: true }); };
    const text = (sel) => page.textContent(sel);
    const overflow = async (where) => { const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(ov <= 0, vp.name + ' horizontal overflow at ' + where + ': ' + ov); };
    const standings = async () => { await page.goto(BASE + '/index.html#/clubhouse'); await page.waitForSelector('.standings tbody tr'); return page.$$eval('.standings tbody tr', (rows) => rows.map((r) => r.querySelector('.name').textContent + ':' + r.querySelector('.pts-box').textContent)); };
    const votesStored = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('dd-demo-data-v2')); return d.polls[0].slots.map((s) => Object.keys(s.votes).length); });

    await page.goto(BASE + '/index.html#/clubhouse');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const before = await standings();
    assert.deepStrictEqual(before, ['Jones:7', 'Fitz:5', 'Pirie:3', 'Forrest:1']);

    // --- Clubhouse hero shows the scheduling state, navigation has the new tab
    assert.match(await text('.hero-meta'), /Next Round — Scheduling/i);
    assert.match(await text('.hero-meta'), /3 \/ 4 players responded/);
    assert.match(await text('.hero-meta'), /Awaiting Forrest/);
    const nav = await page.$$eval(vp.width < 980 ? '.tabbar a' : '.main-nav a', (a) => a.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(nav, ['Clubhouse', 'Fixtures', 'Tee Sheet', 'Players', 'Fines', 'Records']);
    assert.ok(await page.isVisible(vp.width < 700 ? '.tab-submit' : '.btn-submit'), 'Submit Result still present');
    await page.click('.hero-meta .meta-link');
    await page.waitForSelector('.tee-status');
    assert.match(await text('.hero'), /The Tee Sheet/); assert.match(await text('.hero'), /Four players\. One tee time\. Zero excuses\./);
    assert.match(await text('.tee-status'), /Round 05 — Find a date/i);
    assert.match(await text('.tee-status'), /3 of 4 players responded/);
    assert.match(await text('.tee-status'), /Awaiting response/);
    assert.strictEqual(await page.$$eval('.tee-person.done', (x) => x.length), 3);
    assert.strictEqual(await page.$('.tee-banner'), null, 'no date is called a winner while a reply is missing');
    assert.ok(!/all four available/i.test(await text('.tee-slots')));
    await overflow('polling'); await shot('1-polling');

    // --- WhatsApp share link + reminder copy
    const wa = await page.getAttribute('[data-share="poll"]', 'href');
    assert.ok(wa.startsWith('https://wa.me/?text='));
    const msg = decodeURIComponent(wa.split('?text=')[1]);
    assert.match(msg, /^🏌️ DESIGNATED DRIVERS — ROUND 05\nTime to lock in the next round\.\nSubmit your availability by Fri 4 Dec, 6:00 PM\.\n3 of 4 players have responded\.\nVote here:\n/);
    assert.ok(msg.endsWith(BASE + '/#/tee-sheet'), 'message carries the live site link: ' + msg.split('\n').pop());
    await page.click('[data-tee="remind"]');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => navigator.clipboard.readText()), 'Forrest — you’re the last one to submit availability for Round 05. Get onto it.\n' + BASE + '/#/tee-sheet');

    // --- vote as Forrest (demo identity); votes save immediately, never duplicate
    assert.strictEqual(await page.inputValue('#demoPlayerSel'), 'forrest');
    const t0 = Date.now();
    for (const id of ['demo-slot-1', 'demo-slot-2', 'demo-slot-3', 'demo-slot-4']) await page.click('[data-slot-id="' + id + '"] .tee-choice .available');
    const tapMs = Date.now() - t0;
    await page.waitForFunction(() => /4 of 4 players responded/.test(document.querySelector('.tee-status').textContent));
    assert.match(await text('.tee-status'), /All four have responded/);
    assert.match(await text('.tee-banner'), /All four available/i);
    assert.match(await text('.tee-banner'), /Sat 12 Dec · Morning/);
    assert.match(await text('[data-slot-id="demo-slot-3"]'), /All four available/i);
    assert.match(await text('[data-slot-id="demo-slot-1"]'), /Likely to work/i);
    assert.match(await text('[data-slot-id="demo-slot-2"]'), /Doesn’t work/i);
    assert.strictEqual(await page.$('[data-slot-id="demo-slot-2"] [data-tee="lock"]'), null, 'cannot lock in a date someone can’t make');
    await page.waitForTimeout(700);
    assert.deepStrictEqual(await votesStored(), [4, 4, 4, 4]);
    // change of plans: latest vote replaces the previous one and the ranking follows
    await page.click('[data-slot-id="demo-slot-3"] .tee-choice .maybe');
    await page.waitForFunction(() => /Likely to work/i.test(document.querySelector('[data-slot-id="demo-slot-3"]').textContent));
    assert.match(await text('.tee-banner'), /Likely to work/i);
    assert.ok(!/all four available/i.test(await text('.tee-slots')), 'a Maybe is never shown as unanimous');
    await page.click('[data-tee="view"][data-id="best"]');
    const order = await page.$$eval('.tee-slot', (s) => s.map((x) => x.dataset.slotId));
    assert.deepStrictEqual(order, ['demo-slot-1', 'demo-slot-3', 'demo-slot-4', 'demo-slot-2'], 'best first: strong (by date), then the unavailable one last');
    await page.click('[data-tee="view"][data-id="date"]');
    await page.click('[data-slot-id="demo-slot-3"] .tee-choice .available');
    await page.waitForTimeout(700);
    assert.deepStrictEqual(await votesStored(), [4, 4, 4, 4], 'still exactly one vote per player per slot');

    // --- refresh keeps everything; a second tab (another "device" on this browser) sees and changes it
    await page.reload(); await page.waitForSelector('.tee-status');
    assert.match(await text('.tee-status'), /4 of 4 players responded/);
    assert.ok(await page.$('[data-slot-id="demo-slot-3"] .tee-choice .available.on'), 'my vote is still selected after refresh');
    const tab2 = await context.newPage();
    await tab2.goto(BASE + '/index.html#/tee-sheet'); await tab2.waitForSelector('.tee-status');
    assert.match(await tab2.textContent('.tee-status'), /4 of 4 players responded/);
    await tab2.selectOption('#demoPlayerSel', 'fitz');
    await tab2.click('[data-slot-id="demo-slot-2"] .tee-choice .maybe'); await tab2.waitForTimeout(700); await tab2.close();
    await page.reload(); await page.waitForSelector('.tee-status');
    assert.match(await text('[data-slot-id="demo-slot-2"]'), /Likely to work/i);
    await shot('2-all-voted');

    // --- lock in a date with a Maybe: Jones must explicitly confirm before the tee time can be confirmed
    await page.click('[data-slot-id="demo-slot-4"] [data-tee="lock"]');
    assert.match(await text('.modal'), /Jones didn’t say “Available”/);
    await page.click('#cfOk');
    await page.waitForSelector('.tee-hero-card.agreed');
    assert.match(await text('.tee-hero-card'), /Round 05 — Date agreed/i);
    assert.match(await text('.tee-hero-card'), /Sunday 13 December/);
    assert.match(await text('.tee-hero-card'), /Booking pending/);
    assert.match(await text('.tee-hero-card'), /Agreed by 3 of 4 — awaiting Jones/);
    assert.strictEqual(await page.$('.tee-choice'), null, 'voting is closed once a date is agreed');
    await overflow('agreed'); await shot('3-agreed');
    await page.click('[data-tee="confirm-tee"]'); await page.fill('#ctCourse', 'Wembley Golf Course'); await page.fill('#ctTime', '07:40'); await page.click('#ctGo');
    await page.waitForSelector('.toast.error');
    assert.match(await text('.toast.error'), /Still awaiting confirmation from Jones/);
    await page.waitForSelector('.tee-hero-card.agreed');
    assert.match(await (await standings()).join(), /Jones:7/);
    assert.match(await text('.hero-meta'), /Date Agreed/i); assert.match(await text('.hero-meta'), /Sunday 13 December/); assert.match(await text('.hero-meta'), /Booking pending/);
    await page.goto(BASE + '/index.html#/tee-sheet'); await page.waitForSelector('.tee-hero-card.agreed');
    assert.strictEqual(await page.$('[data-tee="im-in"]'), null, 'Forrest cannot confirm for Jones');
    await page.selectOption('#demoPlayerSel', 'jones');
    await page.click('[data-tee="im-in"]');
    await page.waitForFunction(() => /Agreed by all four/.test(document.querySelector('.tee-hero-card').textContent));

    // --- confirm the tee time: one fixture, updated everywhere
    await page.click('[data-tee="confirm-tee"]');
    assert.strictEqual(await page.inputValue('#ctDate'), '2026-12-13');
    await page.fill('#ctCourse', 'Wembley Golf Course'); await page.fill('#ctTime', '07:40'); await page.fill('#ctRef', 'WGC-4471'); await page.click('#ctGo');
    await page.waitForSelector('.tee-hero-card.confirmed');
    const card = await text('.tee-hero-card');
    assert.match(card, /Round 05 — Confirmed/i); assert.match(card, /Sunday 13 December/); assert.match(card, /7:40 AM/); assert.match(card, /Wembley Golf Course/); assert.match(card, /Jones · Fitz · Pirie · Forrest/);
    await overflow('confirmed'); await shot('4-confirmed');
    const wa2 = decodeURIComponent((await page.getAttribute('[data-share="confirmed"]', 'href')).split('?text=')[1]);
    assert.strictEqual(wa2, '🏌️ DESIGNATED DRIVERS — ROUND 05\nWe’re locked in.\n📍 Wembley Golf Course\n📅 Sunday 13 December\n⏰ 7:40 AM\nJones · Fitz · Pirie · Forrest\nSee the fixture:\n' + BASE + '/#/tee-sheet');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-tee="ics"]')]);
    assert.strictEqual(dl.suggestedFilename(), 'designated-drivers-round-05.ics');
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(ics.includes('DTSTART:20261212T234000Z'), '7:40 AM Perth'); assert.ok(ics.includes('DTEND:20261213T041000Z')); assert.ok(ics.includes('LOCATION:Wembley Golf Course')); assert.ok(ics.includes('SUMMARY:Designated Drivers — Round 05'));
    // poll history is kept and collapsible
    await page.click('.tee-history summary');
    assert.match(await text('.tee-history'), /Date locked in: Sun 13 Dec/); assert.match(await text('.tee-history'), /Jones confirmed/); assert.match(await text('.tee-history'), /Tee time confirmed/);

    await page.goto(BASE + '/index.html#/fixtures'); await page.waitForSelector('.fixture');
    assert.strictEqual(await page.$$eval('.fixture', (f) => f.length), 12, 'still exactly twelve fixtures — no duplicate record');
    const r5 = await text('[data-fixture="demo-fx-5"]');
    assert.match(r5, /Sun 13 Dec · 7:40 AM/); assert.match(r5, /Wembley Golf Course/); assert.match(r5, /Tee time confirmed/i);
    await overflow('fixtures');
    const after = await standings();
    assert.deepStrictEqual(after, before, 'championship standings untouched by scheduling');
    assert.match(await text('.hero-meta'), /Sun 13 Dec · 7:40 AM/); assert.match(await text('.hero-meta'), /Wembley Golf Course/);
    await shot('5-clubhouse-confirmed');
    for (const r of ['fines', 'records', 'players', 'players/jones']) { await page.goto(BASE + '/index.html#/' + r); await page.waitForTimeout(250); await overflow(r); }
    assert.match(await text('#app'), /Jones/);

    // --- a second poll for the same round cannot be created; another round can
    await page.goto(BASE + '/index.html#/tee-sheet'); await page.waitForSelector('.tee-hero-card.confirmed');
    // amend the booking, then reopen without losing votes
    await page.click('[data-tee="confirm-tee"]'); await page.fill('#ctTime', '08:10'); await page.click('#ctGo');
    await page.waitForFunction(() => /8:10 AM/.test(document.querySelector('.tee-hero-card').textContent));
    await page.click('[data-tee="reopen"]'); await page.click('#cfOk');
    await page.waitForSelector('.tee-status');
    assert.match(await text('.tee-status'), /4 of 4 players responded/);
    await page.waitForTimeout(400);
    assert.deepStrictEqual(await votesStored(), [4, 4, 4, 4], 'reopening keeps the voting history');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-demo-data-v2')).fixtures[4].teeTime), null);
    await page.evaluate(() => { location.hash = '#/fixtures'; }); await page.waitForSelector('[data-fixture="demo-fx-5"]');
    assert.match(await text('[data-fixture="demo-fx-5"]'), /Finding a date/i);
    // open a poll for Round 06; Round 05 is not offered because it already has one
    await page.evaluate(() => { location.hash = '#/tee-sheet'; }); await page.waitForSelector('.tee-status');
    await page.evaluate(async () => { /* no public hook: use the organiser UI */ });
    await page.goto(BASE + '/index.html#/fixtures'); await page.waitForSelector('.fixture');
    await page.goto(BASE + '/index.html#/tee-sheet'); await page.waitForSelector('.tee-status');
    await page.click('[data-tee="cancel-poll"]'); await page.click('#cfOk');
    await page.waitForSelector('.tee-empty');
    assert.match(await text('.tee-empty'), /Nothing on the tee sheet\. Time to organise the next round\./);
    assert.match(await text('#app'), /Scheduling History/);
    await shot('6-empty');
    await page.click('[data-tee="create"]'); await page.waitForSelector('#tpRound');
    assert.strictEqual(await page.$$eval('.tee-slot-line', (l) => l.length), 4, 'next two weekends pre-filled');
    await page.selectOption('.tee-slot-line[data-i="1"] [data-k="window"]', 'time');
    await page.fill('.tee-slot-line[data-i="1"] [data-k="startTime"]', '07:40');
    await page.fill('#tpDd', '2026-12-18'); await page.fill('#tpDt', '17:30');
    await shot('7-create');
    await page.click('#tpGo');
    await page.waitForSelector('.tee-status');
    assert.match(await text('.tee-status'), /0 of 4 players responded/);
    assert.match(await text('.tee-status'), /Vote by Fri 18 Dec, 5:30 PM/);
    assert.match(await text('.tee-slots'), /— 7:40 AM/);
    const stored = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('dd-demo-data-v2')); return { n: d.polls.length, active5: d.polls.filter((p) => p.fixtureId === 'demo-fx-5' && p.status !== 'cancelled').length, deadline: d.polls[1].deadline }; });
    assert.strictEqual(stored.active5, 1); assert.strictEqual(stored.n, 2);
    assert.strictEqual(stored.deadline, '2026-12-18T09:30:00.000Z', '5:30 PM Perth stored as the exact UTC instant');
    await page.reload(); await page.waitForSelector('.tee-status');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-demo-data-v2')).polls.length), 2, 'refreshing never creates a poll');
    await page.click('[data-tee="create"]', { timeout: 500 }).catch(() => {});
    assert.strictEqual(await page.$('#tpRound option[value="demo-fx-5"]'), null, 'a round with a live poll is not offered again');
    console.log('  ✓ ' + vp.name + ' Tee Sheet flow passed (4 dates answered in ' + tapMs + ' ms of tapping)');
    await context.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Tee Sheet browser tests passed');
})().catch((e) => { console.error('TEE SHEET E2E FAILED:', e.message); process.exit(1); });
