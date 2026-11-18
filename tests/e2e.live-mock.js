/* Exercises the LIVE (Supabase) code path against a mocked supabase-js client shaped
   like real PostgREST responses: no logins, every write is a guarded function call,
   optional club code, and a helpful message when the database has not been updated.
   node tests/e2e.live-mock.js http://localhost:8765 */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8765';
const T = require('../teetime.js');
// by the time the Tee Time checks run, Round 02 has been recorded with today's date
const TODAY = T.today('Australia/Perth');
const W = T.windowFor({ lastPlayed: TODAY, today: TODAY }).weekends;
const FAKE = `
(function(){
  var ids=['jones','fitz','pirie','forrest'], splits=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
  var fixtures=[]; for(var r=1;r<=12;r++){var s=splits[(r-1)%3];
    fixtures.push({id:'fx'+r,season_id:'s1',round_number:r,scheduled_date:r===2?'2030-01-05':null,course:r===2?'Lake Karrinyup':null,
      fixture_teams:[{side:'b',team_members:[{player_id:ids[s[3]]},{player_id:ids[s[2]]}]},{side:'a',team_members:[{player_id:ids[s[1]]},{player_id:ids[s[0]]}]}],
      results:r===1?{score_a:75,score_b:79,played_on:'2026-11-01',notes:null,updated_at:'x'}:null});}
  var db={players:ids.map(function(id,i){return{id:id,name:id[0].toUpperCase()+id.slice(1),color:null,image_url:null,sort_order:i+1,quote:id==='jones'?'Quote from the database.':null,best_shot:null,strength:id==='jones'?'Strength from the database.':null,weakness:null};}),
    seasons:[{id:'s1',number:1,name:'Season 01',year:2026,total_rounds:12,status:'active'}],fixtures:fixtures,
    fine_categories:[{id:'c1',name:'Lost ball',default_amount:'2.00',active:true,sort_order:1}],
    availability:[{player_id:'jones',weekend:window.__W,mask:32}],tee_proposals:[],tee_responses:[],
    fines:[{id:'f1',season_id:'s1',player_id:'pirie',category_id:'c1',fixture_id:'fx1',amount:'2.00',notes:null,created_at:'2026-11-01',fine_categories:{name:'Lost ball'},fine_payments:[{amount:'2.00'}]}]};
  window.__calls=[]; window.__auth=0;
  function q(table){var missing=window.__noTee&&['availability','tee_proposals','tee_responses'].indexOf(table)!==-1;
    var p={then:function(res,rej){return Promise.resolve(missing?{data:null,error:{message:'relation "public.'+table+'" does not exist'}}:{data:db[table],error:null}).then(res,rej);}};
    ['select','order','eq','gte','update','insert','delete'].forEach(function(m){p[m]=function(){window.__calls.push([table,m]);return p;};});return p;}
  window.supabase={createClient:function(url,key){window.__key=key;return{
    from:q,channel:function(){return{on:function(){return this;},subscribe:function(){}};},
    auth:new Proxy({},{get:function(){window.__auth++;return function(){return Promise.resolve({data:{session:null},error:null});};}}),
    rpc:function(fn,args){window.__calls.push(['rpc',fn,args]);
      if(window.__oldDb)return Promise.resolve({data:null,error:{message:'Could not find the function public.'+fn+'(p_code, ...) in the schema cache'}});
      if(window.__code&&args.p_code!==window.__code)return Promise.resolve({data:null,error:{message:'CLUB_CODE_REQUIRED'}});
      if(fn==='save_result'){var f=db.fixtures.filter(function(x){return x.id===args.p_fixture_id;})[0];f.results={score_a:args.p_score_a,score_b:args.p_score_b,played_on:args.p_played_on,notes:args.p_notes};f.course=args.p_course;}
      if(fn==='set_availability'){return Promise.resolve({data:args.p_changes.map(function(c){var r=db.availability.filter(function(a){return a.player_id===args.p_player_id&&a.weekend===c.w;})[0];
        if(!r){r={player_id:args.p_player_id,weekend:c.w,mask:0};db.availability.push(r);} r.mask=(r.mask|c.s)&~c.c; return {w:c.w,mask:r.mask};}),error:null});}
      if(fn==='propose_round'){db.tee_proposals.push({id:'tp1',fixture_id:args.p_fixture_id,play_date:args.p_date,slot:args.p_slot,status:'open',proposed_by:args.p_player_id,tee_time:null,course:null,created_at:'x'});
        db.tee_responses.push({proposal_id:'tp1',player_id:args.p_player_id,response:'yes'});return Promise.resolve({data:'tp1',error:null});}
      if(fn==='add_fine'){db.fines.push({id:'f'+(db.fines.length+1),season_id:args.p_season_id,player_id:args.p_player_id,category_id:args.p_category_id,fixture_id:args.p_fixture_id,amount:'2.00',notes:null,created_at:'2026-11-02',fine_categories:{name:'Lost ball'},fine_payments:[]});}
      return Promise.resolve({data:'ok',error:null});}};}};
})();`;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function open(init) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((w) => { window.__W = w; }, W[0]);
    if (init) await page.addInitScript(init);
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.DD_CONFIG={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test'};" }));
    await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
    await page.goto(BASE + '/index.html#/clubhouse');
    await page.waitForSelector('.standings tbody tr');
    return page;
  }
  const pts = (page) => page.$$eval('.standings tbody tr', (rows) => rows.map((r) => r.querySelector('.name').textContent + ':' + r.querySelector('.pts-box').textContent));
  const calls = (page, fn) => page.evaluate((f) => window.__calls.filter((c) => c[1] === f).map((c) => c[2]), fn);

  // --- straight in: no login, live data, one-screen submit
  let page = await open();
  assert.ok(await page.$eval('#demoBanner', (b) => b.hidden), 'no demo banner in live mode');
  assert.deepStrictEqual(await pts(page), ['Jones:2', 'Fitz:2', 'Pirie:0', 'Forrest:0']);
  assert.match(await page.textContent('.hero-meta'), /Lake Karrinyup/);
  assert.match(await page.textContent('.latest-card'), /75 – 79/);
  assert.ok(!/sign in|log ?in|password/i.test(await page.textContent('body')));
  await page.click('.tab-submit'); await page.waitForSelector('#srRound');
  await page.fill('#srCourse', 'Lake Karrinyup'); await page.fill('#srA', '81'); await page.fill('#srB', '81'); await page.click('#srSave');
  await page.waitForFunction(() => document.querySelector('.latest-card') && /81 – 81/.test(document.querySelector('.latest-card').textContent));
  assert.deepStrictEqual(await pts(page), ['Jones:3', 'Fitz:3', 'Pirie:1', 'Forrest:1']);
  const sr = (await calls(page, 'save_result'))[0];
  assert.strictEqual(sr.p_mode, 'create'); assert.strictEqual(sr.p_fixture_id, 'fx2'); assert.strictEqual(sr.p_code, null);
  // fine in two taps
  await page.goto(BASE + '/index.html#/fines'); await page.waitForSelector('.fines-hero-stats');
  await page.click('[data-action="add-fine"]'); await page.click('.pick-item:has(input[value="forrest"])'); await page.click('#fnSave');
  await page.waitForFunction(() => /2 offences/.test(document.querySelector('.fines-hero-stats').textContent));
  const af = (await calls(page, 'add_fine'))[0];
  assert.strictEqual(af.p_player_id, 'forrest'); assert.strictEqual(af.p_category_id, 'c1'); assert.strictEqual(af.p_season_id, 's1');
  // every write went through a database function — never a direct table write — and auth is never used
  const direct = await page.evaluate(() => window.__calls.filter((c) => ['insert', 'update', 'delete'].includes(c[1])).length);
  assert.strictEqual(direct, 0, 'no direct table writes');
  assert.strictEqual(await page.evaluate(() => window.__auth), 0, 'the auth client is never touched');
  assert.strictEqual(await page.evaluate(() => window.__key), 'sb_publishable_test');
  await page.goto(BASE + '/index.html#/players/jones'); await page.waitForSelector('.profile-hero');
  assert.match(await page.textContent('.bio-card'), /“Quote from the database\.”/);
  assert.match(await page.textContent('.bio-card'), /Strength from the database\./);
  await page.click('[data-edit-bio="jones"]'); await page.fill('#bio-weakness', 'Bunkers'); await page.click('#bioSave'); await page.waitForTimeout(400);
  const up = (await calls(page, 'update_player_profile'))[0];
  assert.deepStrictEqual(up, { p_player_id: 'jones', p_quote: 'Quote from the database.', p_best_shot: null, p_strength: 'Strength from the database.', p_weakness: 'Bunkers', p_code: null });
  // --- Tee Time: shared data, availability saved through the guarded function
  await page.goto(BASE + '/index.html#/tee-time'); await page.waitForSelector('.tee-next');
  assert.match(await page.textContent('.tee-next'), /Round 03/, 'next unplayed round (Round 02 now has a result)');
  await page.click('label.tee-radio:has(input[value="pirie"])');
  await page.click(`[data-tee="cell"][data-w="${W[0]}"][data-d="1"][data-s="0"]`);
  await page.click(`[data-tee="cell"][data-w="${W[0]}"][data-d="1"][data-s="1"]`);
  await page.waitForFunction(() => /Saved/.test(document.querySelector('#teeSave').textContent));
  const av = await calls(page, 'set_availability');
  assert.strictEqual(av.length, 1, 'quick taps are batched into one save');
  assert.deepStrictEqual(av[0], { p_player_id: 'pirie', p_changes: [{ w: W[0], s: T.bit(1, 0) | T.bit(1, 1), c: 0 }], p_code: null });
  assert.ok(await page.$(`[data-tee="cell"][data-w="${W[0]}"][data-d="1"][data-s="0"].yes`));
  await page.click('.ov-row'); await page.click('#tpGo');
  await page.waitForSelector('.tn-box.proposed');
  assert.deepStrictEqual((await calls(page, 'propose_round'))[0], { p_fixture_id: 'fx3', p_date: T.addDays(W[0], 1), p_slot: 0, p_player_id: 'pirie', p_code: null });
  const direct2 = await page.evaluate(() => window.__calls.filter((c) => ['insert', 'update', 'delete'].includes(c[1])).length);
  assert.strictEqual(direct2, 0, 'still no direct table writes');
  await page.close();

  // --- site deployed before the Tee Time tables exist: tab explains, the rest works
  page = await open(() => { window.__noTee = true; });
  assert.deepStrictEqual(await pts(page), ['Jones:2', 'Fitz:2', 'Pirie:0', 'Forrest:0']);
  await page.goto(BASE + '/index.html#/tee-time'); await page.waitForSelector('.empty');
  assert.match(await page.textContent('#app'), /Tee Time needs a one-off database update/);
  await page.close();

  // --- optional club code: asked once, remembered on the device
  page = await open(() => { window.__code = 'birdie24'; });
  const prompts = []; let answer = 'wrong';
  page.on('dialog', (d) => { prompts.push(d.message()); d.accept(answer); });
  await page.goto(BASE + '/index.html#/fines'); await page.waitForSelector('.fines-hero-stats');
  await page.click('[data-action="add-fine"]'); await page.click('.pick-item:has(input[value="fitz"])'); await page.click('#fnSave');
  await page.waitForSelector('.toast.error');
  assert.match(await page.textContent('.toast.error'), /club code isn’t right/);
  answer = 'birdie24';
  await page.click('#fnSave');
  await page.waitForFunction(() => /2 offences/.test(document.querySelector('.fines-hero-stats').textContent));
  assert.strictEqual(prompts.length, 2);
  await page.click('[data-toggle-paid]'); await page.waitForTimeout(400);
  assert.strictEqual(prompts.length, 2, 'code remembered — not asked again');
  assert.strictEqual((await calls(page, 'set_fine_paid'))[0].p_code, 'birdie24');
  await page.close();

  // --- site deployed before the database was updated: reads work, writes explain what to do
  page = await open(() => { window.__oldDb = true; });
  assert.deepStrictEqual(await pts(page), ['Jones:2', 'Fitz:2', 'Pirie:0', 'Forrest:0']);
  await page.click('.tab-submit'); await page.waitForSelector('#srRound');
  await page.fill('#srCourse', 'X'); await page.fill('#srA', '80'); await page.fill('#srB', '70'); await page.click('#srSave');
  await page.waitForSelector('.toast.error');
  assert.match(await page.textContent('.toast.error'), /run the latest supabase-schema\.sql/);
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Live-mode (mocked Supabase) tests passed');
})().catch((e) => { console.error('LIVE MOCK FAILED:', e.message); process.exit(1); });
