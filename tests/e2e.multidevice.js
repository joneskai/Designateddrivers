/* =====================================================================
   Four devices, one real database.

   Runs the site in LIVE mode (the Supabase code path) against a real local
   PostgreSQL loaded with supabase-schema.sql. A tiny stand-in for Supabase's
   REST API (below) passes each request to the database as the `anon`
   visitor role, so Row Level Security, the guarded functions, rate limits
   and real concurrent transactions are all exercised. Each "device" is a
   separate browser context: its own storage, its own IP address.

   Needs: Playwright, psql and a local PostgreSQL you can create databases in.
     DD_PG_HOST=/tmp DD_PG_PORT=55433 DD_PG_USER=postgres node tests/e2e.multidevice.js
   ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const assert = require('assert');
const { chromium } = require('playwright');
const T = require('../teetime.js');

const ROOT = path.join(__dirname, '..');
const PG = { host: process.env.DD_PG_HOST || '/tmp', port: process.env.DD_PG_PORT || '55433', user: process.env.DD_PG_USER || 'postgres' };
const DB = 'dd_multidevice';
const PORT = 8790;
const BASE = `http://localhost:${PORT}/index.html`;

/* ---------- database helpers ---------- */
function psql(args, db) {
  return new Promise((resolve, reject) => {
    execFile('psql', ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db || DB, '-qtAX', '-v', 'ON_ERROR_STOP=1', ...args], { maxBuffer: 20e6 }, (err, out, errOut) => {
      if (err) { const m = /ERROR:\s+([^\n]+)/.exec(errOut || ''); reject(Object.assign(new Error(m ? m[1] : (errOut || err.message)), { sqlError: !!m })); }
      else resolve(out.trim());
    });
  });
}
const lit = (v) => { const s = String(v); assert.ok(!s.includes('$v$'), 'unsafe literal'); return '$v$' + s + '$v$'; };
/** Run one statement as the anonymous website visitor, from a given IP. */
function asVisitor(sql, ip) {
  return psql(['-c', 'set role anon', '-c', `do $$ begin perform set_config('request.headers', ${lit(JSON.stringify({ 'x-forwarded-for': ip }))}, false); end $$`, '-c', sql]);
}
const q = (sql) => psql(['-c', sql]);

/* ---------- reads, shaped the way PostgREST returns them ---------- */
const READS = {
  players: () => `select coalesce(json_agg(p order by sort_order), '[]') from players p`,
  seasons: () => `select coalesce(json_agg(json_build_object('id', id, 'number', number, 'name', name, 'year', year, 'total_rounds', total_rounds, 'status', status) order by number), '[]') from seasons`,
  fixtures: () => `select coalesce(json_agg(to_jsonb(f) || jsonb_build_object(
      'fixture_teams', (select coalesce(json_agg(json_build_object('side', ft.side, 'team_members', (select coalesce(json_agg(json_build_object('player_id', tm.player_id)), '[]') from team_members tm where tm.fixture_team_id = ft.id))), '[]') from fixture_teams ft where ft.fixture_id = f.id),
      'results', (select json_build_object('score_a', r.score_a, 'score_b', r.score_b, 'played_on', r.played_on, 'notes', r.notes, 'updated_at', r.updated_at) from results r where r.fixture_id = f.id)
    ) order by f.round_number), '[]') from fixtures f`,
  fine_categories: () => `select coalesce(json_agg(json_build_object('id', id, 'name', name, 'default_amount', default_amount, 'active', active, 'sort_order', sort_order) order by sort_order), '[]') from fine_categories`,
  fines: () => `select coalesce(json_agg(to_jsonb(f) || jsonb_build_object('fine_categories', (select json_build_object('name', c.name) from fine_categories c where c.id = f.category_id),
      'fine_payments', (select coalesce(json_agg(json_build_object('amount', fp.amount)), '[]') from fine_payments fp where fp.fine_id = f.id)) order by f.created_at), '[]') from fines f`,
  availability: (qs) => { const g = /^gte\.(\d{4}-\d{2}-\d{2})$/.exec(qs.get('weekend') || ''); return `select coalesce(json_agg(json_build_object('player_id', player_id, 'weekend', weekend, 'mask', mask)), '[]') from availability` + (g ? ` where weekend >= ${lit(g[1])}` : ''); },
  tee_proposals: () => `select coalesce(json_agg(t order by created_at), '[]') from tee_proposals t`,
  tee_responses: () => `select coalesce(json_agg(json_build_object('proposal_id', proposal_id, 'player_id', player_id, 'response', response)), '[]') from tee_responses`
};
const calls = [];
function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return lit(JSON.stringify(v));
  return lit(v);
}

/* ---------- the stand-in API + static site ---------- */
function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const ip = req.headers['x-sim-ip'] || '127.0.0.1';
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body); };
    try {
      if (url.pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`window.DD_CONFIG={supabaseUrl:'http://localhost:${PORT}',supabasePublishableKey:'sb_publishable_test'};`); }
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
      if (rpc && req.method === 'POST') {
        let body = ''; for await (const ch of req) body += ch;
        const args = body ? JSON.parse(body) : {};
        calls.push({ fn: rpc[1], ip, args, at: Date.now() });
        const sql = `select json_build_object('r', public.${rpc[1]}(${Object.keys(args).map((k) => `${k} => ${sqlValue(args[k])}`).join(', ')}))`;
        try { const out = JSON.parse(await asVisitor(sql, ip)); return send(200, JSON.stringify(out.r === '' ? null : out.r)); }
        catch (e) { return send(400, JSON.stringify({ code: e.sqlError ? 'P0001' : '500', message: e.message, details: null, hint: null })); }
      }
      const read = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
      if (read && req.method === 'GET' && READS[read[1]]) return send(200, await asVisitor(READS[read[1]](url.searchParams), ip));
      if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/realtime/') || url.pathname.startsWith('/auth/')) return send(404, '{"message":"not available in this test"}');
      const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    } catch (e) { send(500, JSON.stringify({ message: e.message })); }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

(async () => {
  // fresh database, exactly like a new production project
  await psql(['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`], 'postgres');
  await psql(['-f', path.join(ROOT, 'tests/supabase-shim.sql'), '-f', path.join(ROOT, 'supabase-schema.sql')]);
  const server = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  const TODAY = T.today('Australia/Perth');
  const W = T.windowFor({ lastPlayed: null, today: TODAY }).weekends;        // Round 01: no previous round
  const FRI = 0, SAT = 1, SUN = 2, EA = 0, LA = 1, EP = 3, TW = 4;
  const PLAYERS = ['jones', 'fitz', 'pirie', 'forrest'];

  async function device(name, ip, who) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-sim-ip': ip } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await page.goto(BASE + '#/tee-time'); await page.waitForSelector('.tee-next');
    if (who) { await page.click(`label.tee-radio:has(input[value="${who}"])`); await page.waitForFunction((w) => document.querySelector('.tee-editing').textContent.toLowerCase().includes(w), who); }
    return { name, ip, who, context, page };
  }
  const cell = (w, d, s) => `[data-tee="cell"][data-w="${w}"][data-d="${d}"][data-s="${s}"]`;
  const saved = (d) => d.page.waitForFunction(() => /Saved/.test((document.querySelector('#teeSave') || {}).textContent || ''), null, { timeout: 15000 });
  const masks = async () => { const rows = JSON.parse(await q(`select coalesce(json_agg(json_build_object('p', player_id, 'w', weekend, 'm', mask)), '[]') from availability`)); const o = {}; rows.forEach((r) => { o[r.p + '|' + r.w] = r.m; }); return o; };
  const bits = (...c) => c.reduce((m, [d, s]) => m | T.bit(d, s), 0);
  const step = (s) => console.log('  • ' + s);

  try {
    console.log('Four devices against a real database (' + TODAY + ', calendar from ' + W[0] + ')');
    const dev = {};
    for (const [i, p] of PLAYERS.entries()) dev[p] = await device(p + '-phone', '10.0.0.' + (i + 1), p);
    step('four phones open Tee Time, each picks their own name');
    assert.match(await dev.jones.page.textContent('.tee-next'), /Round 01/);
    assert.match(await dev.jones.page.textContent('.tee-next'), /First round of the season/);

    // ---------- 1. everyone fills in availability at the same moment
    await Promise.all([
      (async () => { const p = dev.jones.page; for (const [d, s] of [[SAT, EA], [SAT, LA], [SUN, LA]]) await p.click(cell(W[1], d, s)); await p.click(`[data-tee="week"][data-w="${W[2]}"][data-v="all"]`); })(),
      (async () => { const p = dev.fitz.page; for (const [d, s] of [[SAT, EA], [SUN, LA]]) await p.click(cell(W[1], d, s)); await p.click(cell(W[2], SAT, EA)); })(),
      (async () => { const p = dev.pirie.page; for (const [d, s] of [[SAT, EA], [SUN, LA], [FRI, TW]]) await p.click(cell(W[1], d, s)); })(),
      (async () => { const p = dev.forrest.page; await p.click(cell(W[1], SAT, EA)); await p.click(cell(W[1], SAT, EA)); await p.click(cell(W[1], SAT, EA)); await p.click(cell(W[1], SUN, EP)); })()
    ]);
    await Promise.all(PLAYERS.map((p) => saved(dev[p])));
    const m1 = await masks();
    assert.deepStrictEqual(m1, {
      ['jones|' + W[1]]: bits([SAT, EA], [SAT, LA], [SUN, LA]), ['jones|' + W[2]]: T.FULL_MASK,
      ['fitz|' + W[1]]: bits([SAT, EA], [SUN, LA]), ['fitz|' + W[2]]: bits([SAT, EA]),
      ['pirie|' + W[1]]: bits([SAT, EA], [SUN, LA], [FRI, TW]),
      ['forrest|' + W[1]]: bits([SAT, EA], [SUN, EP])
    }, 'every tap from every phone landed, nothing overwritten');
    step('all four tapped at once: every tap saved exactly, nothing overwritten');

    // ---------- 2. every phone shows the same answer
    await Promise.all(PLAYERS.map((p) => dev[p].page.reload()));
    await Promise.all(PLAYERS.map((p) => dev[p].page.waitForSelector('.tn-box.best')));
    const satEA = T.shortDate(T.addDays(W[1], 1)) + ' · Early AM';
    const views = await Promise.all(PLAYERS.map(async (p) => ({ best: (await dev[p].page.textContent('.tn-box.best')).replace(/\s+/g, ' '), ov: await dev[p].page.$$eval('.ov-when', (o) => o.map((x) => x.textContent)) })));
    views.forEach((v) => { assert.match(v.best, new RegExp(satEA + '.*4/4 available')); assert.deepStrictEqual(v.ov, views[0].ov); });
    assert.match(views[0].ov[1], /3\/4/);
    step('every phone shows the same best time (' + satEA + ', 4/4) and the same overlaps');
    // each phone still shows its own ticks
    assert.ok(await dev.forrest.page.$(cell(W[1], SAT, EA) + '.yes')); assert.ok(await dev.forrest.page.$(cell(W[1], SUN, LA) + '.no'));
    assert.ok(await dev.jones.page.$(cell(W[2], FRI, EA) + '.yes'));

    // ---------- 3. a change on one phone appears on another without refreshing (15-second check)
    const t0 = Date.now();
    await dev.jones.page.click(cell(W[3], SAT, EA)); await saved(dev.jones);
    await dev.fitz.page.waitForSelector(`.tee-week:nth-child(4) .tw-av.in img[alt="Jones"]`, { timeout: 25000 });
    step('Jones\' new tick showed up on Fitz\'s phone by itself after ' + Math.round((Date.now() - t0) / 1000) + 's');

    // ---------- 3b. "Can't make it" on one phone turns that player green on the others
    await dev.forrest.page.click(`[data-tee="week"][data-w="${W[3]}"][data-v="none"]`); await saved(dev.forrest);
    assert.strictEqual((await masks())['forrest|' + W[3]], T.DECLINED);
    await dev.fitz.page.waitForSelector(`.tee-week:nth-child(4) .tw-av.in img[alt="Forrest"]`, { timeout: 25000 });
    step('Forrest pressed "Can\'t make it": shown green (answered) on Fitz\'s phone');

    // ---------- 4. the same person on two devices at once
    const jones2 = await device('jones-laptop', '10.0.0.9', 'jones');
    await Promise.all([dev.jones.page.click(cell(W[3], SUN, EA)), jones2.page.click(cell(W[3], SUN, TW))]);
    await Promise.all([saved(dev.jones), saved(jones2)]);
    assert.strictEqual((await masks())['jones|' + W[3]], bits([SAT, EA], [SUN, EA], [SUN, TW]));
    step('Jones on two devices at once: both ticks kept');
    await jones2.context.close();

    // ---------- 5. signal drops mid-tap: kept, retried, sent
    const pp = dev.pirie;
    await pp.context.setOffline(true);
    await pp.page.click(cell(W[3], SAT, EA));
    await pp.page.waitForFunction(() => /Not saved yet/.test(document.querySelector('#teeSave').textContent), null, { timeout: 15000 });
    assert.ok(await pp.page.$(cell(W[3], SAT, EA) + '.yes'), 'tap still shown while offline');
    await pp.context.setOffline(false);
    await saved(pp);
    assert.strictEqual((await masks())['pirie|' + W[3]], bits([SAT, EA]));
    step('Pirie lost signal: tap kept on screen, saved automatically when signal came back');
    // closing the page while offline: sent next time the page opens
    await pp.context.setOffline(true);
    await pp.page.click(cell(W[3], SUN, EA));
    await pp.page.waitForTimeout(800);
    await pp.page.close();
    await pp.context.setOffline(false);
    pp.page = await pp.context.newPage(); pp.page.on('pageerror', (e) => errors.push('pirie: ' + e.message));
    await pp.page.goto(BASE + '#/tee-time'); await pp.page.waitForSelector('.tee-next');
    await pp.page.waitForFunction(() => /Saved/.test(document.querySelector('#teeSave').textContent), null, { timeout: 15000 });
    assert.strictEqual((await masks())['pirie|' + W[3]], bits([SAT, EA], [SUN, EA]));
    step('Pirie closed the page while offline: the unsaved tap was sent when he opened it again');

    // ---------- 6. two people press "Propose round" at the same moment
    await Promise.all(PLAYERS.map((p) => dev[p].page.reload()));
    await Promise.all(PLAYERS.map((p) => dev[p].page.waitForSelector('.tn-box.best')));
    await Promise.all(['fitz', 'pirie'].map(async (p) => { await dev[p].page.click('.tn-box.best [data-tee="propose"]'); await dev[p].page.waitForSelector('#tpGo'); }));
    await Promise.all(['fitz', 'pirie'].map((p) => dev[p].page.click('#tpGo')));
    await Promise.all(['fitz', 'pirie'].map((p) => dev[p].page.waitForSelector('.tn-box.proposed', { timeout: 15000 })));
    const props = JSON.parse(await q(`select json_agg(json_build_object('status', status, 'by', proposed_by)) from tee_proposals`));
    assert.strictEqual(props.length, 1, 'only one proposal, even with two presses at once');
    step('Fitz and Pirie pressed Propose at the same moment: one proposal (' + props[0].by + '), the other phone was told and shows it');

    // ---------- 7. everyone confirms from their own phone at once
    await Promise.all(PLAYERS.map((p) => dev[p].page.reload()));
    await Promise.all(PLAYERS.map((p) => dev[p].page.waitForSelector('.tn-box.proposed')));
    const toConfirm = PLAYERS.filter((p) => p !== props[0].by);
    await Promise.all(toConfirm.map((p) => dev[p].page.click('[data-tee="respond"][data-r="yes"]')));
    await Promise.all(toConfirm.map((p) => dev[p].page.waitForSelector('.tee-locked', { timeout: 15000 })));
    assert.strictEqual(await q(`select count(*) from tee_responses where response = 'yes'`), '4');
    await Promise.all(PLAYERS.map((p) => dev[p].page.reload()));
    for (const p of PLAYERS) {
      await dev[p].page.waitForSelector('.tee-locked');
      assert.match(await dev[p].page.textContent('.tee-locked'), /Round 01[\s\S]*Date agreed by all four/);
      assert.match(await dev[p].page.textContent('.tee-next:not(.tee-locked)'), /Round 02/);
      assert.strictEqual(await dev[p].page.textContent('.tw-dates'), T.weekendLabel(T.eligibleFriday(T.addDays(W[1], 1))));
    }
    step('all four confirmed at once: every phone shows Round 01 agreed and Round 02 opening ' + T.shortDate(T.eligibleFriday(T.addDays(W[1], 1))));

    // ---------- 8. one phone sets the tee time; it lands on the fixture for everyone
    const fp = dev.forrest.page;
    await fp.click('.tee-locked [data-tee="schedule"]'); await fp.fill('#tsTime', '07:40'); await fp.fill('#tsCourse', 'Wembley Golf Course'); await fp.click('#tsGo');
    await fp.waitForFunction(() => /7:40 AM/.test(document.querySelector('.tee-locked').textContent));
    const fx = JSON.parse(await q(`select json_build_object('d', scheduled_date, 't', tee_time, 'c', course) from fixtures where round_number = 1`));
    assert.deepStrictEqual(fx, { d: T.addDays(W[1], 1), t: '07:40:00', c: 'Wembley Golf Course' });
    // Jones's phone hasn't reloaded since; just moving to Fixtures picks up Forrest's change
    await dev.jones.page.click('.tabbar a[data-nav="fixtures"]'); await dev.jones.page.waitForSelector('.fixture');
    await dev.jones.page.waitForFunction(() => /7:40 AM[\s\S]*Wembley Golf Course[\s\S]*Scheduled/.test(document.querySelector('.fixture').textContent), null, { timeout: 10000 });
    assert.strictEqual(await q(`select count(*) from fixtures`), '12', 'no duplicate fixtures');
    step('Forrest set 7:40 AM at Wembley: Round 01 on the Fixtures list for everyone');

    // ---------- 9. the round is played and recorded; Tee Time moves on by itself
    const jp = dev.jones.page;
    await jp.goto(BASE + '#/clubhouse'); await jp.waitForSelector('.standings');
    await jp.click('.tab-submit'); await jp.click('[data-act="record"]'); await jp.waitForSelector('#srSave');
    await jp.fill('#srDate', TODAY); await jp.fill('#srA', '78'); await jp.fill('#srB', '83'); await jp.click('#srSave');
    await jp.waitForFunction(() => { const c = document.querySelector('.latest-card'); return c && /Round 01/.test(c.textContent); });
    // Fitz's phone sits on Tee Time without reloading: it moves on to Round 02 within the 15-second check
    await dev.fitz.page.waitForFunction(() => !document.querySelector('.tee-locked') && /Round 02/.test(document.querySelector('.tee-next').textContent), null, { timeout: 25000 });
    assert.match(await dev.fitz.page.textContent('.tee-next'), new RegExp('Round 02[\\s\\S]*Last round: ' + T.shortDate(TODAY) + ' \\(Round 01\\)'));
    assert.strictEqual(await dev.fitz.page.textContent('.tw-dates'), T.weekendLabel(T.windowFor({ lastPlayed: TODAY, today: TODAY }).start));
    step('Jones recorded the result: Fitz\'s phone moved on to Round 02, opening three weeks after today');

    // ---------- 10. limits: normal use is nowhere near them
    const perIp = JSON.parse(await q(`select json_object_agg(ip_hash, n) from (select ip_hash, count(*) n from dd_activity where action = 'availability' group by ip_hash) x`));
    const busiest = Math.max(...Object.values(perIp));
    assert.ok(busiest < 60, 'availability saves from the busiest phone: ' + busiest);
    assert.ok(!calls.some((c) => /Too many/.test(c.err || '')));
    step('busiest phone made ' + busiest + ' availability saves (limit 240 per 10 minutes)');
    const direct = calls.filter((c) => !/^(set_availability|propose_round|respond_proposal|schedule_fixture|save_result|extend_availability|withdraw_proposal)$/.test(c.fn));
    assert.deepStrictEqual(direct, [], 'only expected functions were called');
  } finally {
    await browser.close(); server.close();
  }
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Four-device test passed');
})().catch((e) => { console.error('FOUR-DEVICE TEST FAILED:', e.message); process.exit(1); });
