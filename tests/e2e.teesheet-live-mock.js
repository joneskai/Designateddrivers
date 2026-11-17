/* Tee Sheet permissions in LIVE mode, against a mocked supabase-js client:
   visitor = read-only, player = own votes only, no organiser controls;
   plus graceful behaviour before the migration has been run.
   node tests/e2e.teesheet-live-mock.js http://localhost:8765 */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8765';
const FAKE = `
(function(){
  var ids=['jones','fitz','pirie','forrest'], splits=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
  var fixtures=[]; for(var r=1;r<=12;r++){var s=splits[(r-1)%3];
    fixtures.push({id:'fx'+r,season_id:'s1',round_number:r,scheduled_date:null,course:null,tee_time:null,
      fixture_teams:[{side:'a',team_members:[{player_id:ids[s[0]]},{player_id:ids[s[1]]}]},{side:'b',team_members:[{player_id:ids[s[2]]},{player_id:ids[s[3]]}]}],results:null});}
  var db={players:ids.map(function(id,i){return{id:id,name:id[0].toUpperCase()+id.slice(1),color:null,image_url:null,sort_order:i+1};}),
    seasons:[{id:'s1',number:1,name:'Season 01',year:2026,total_rounds:12,status:'active'}],fixtures:fixtures,fine_categories:[],fines:[],
    scheduling_polls:[{id:'p1',season_id:'s1',fixture_id:'fx1',status:'polling',timezone:'Australia/Perth',voting_deadline:'2026-12-04T10:00:00+00:00',close_at_deadline:false,notes:null,agreed_slot_id:null,tee_date:null,tee_time:null,course:null,duration_minutes:270,created_at:'2026-11-01T00:00:00+00:00'}],
    scheduling_slots:[{id:'sl1',poll_id:'p1',proposed_date:'2026-12-05',time_window:'morning',start_time:null,notes:null,preferred:false},{id:'sl2',poll_id:'p1',proposed_date:'2026-12-12',time_window:'time',start_time:'07:40:00',notes:null,preferred:false}],
    scheduling_votes:[{slot_id:'sl1',player_id:'jones',status:'available'},{slot_id:'sl2',player_id:'jones',status:'available'}],
    scheduling_agreements:[],scheduling_events:[{poll_id:'p1',event_type:'poll_opened',actor_player_id:'jones',event_data:{slots:2},created_at:'2026-11-01T00:00:00+00:00'}]};
  window.__calls=[]; var who=null; var LOGINS={'fitz@example.com':{player:'fitz',admin:false},'jones@example.com':{player:'jones',admin:true}};
  function q(table){var missing=window.__noTee&&/^scheduling_/.test(table);
    var p={then:function(res,rej){return Promise.resolve(missing?{data:null,error:{message:'relation "public.'+table+'" does not exist'}}:{data:db[table],error:null}).then(res,rej);}};
    ['select','order','eq','update','insert','delete'].forEach(function(m){p[m]=function(){window.__calls.push([table,m].concat([].slice.call(arguments)));return p;};});return p;}
  window.supabase={createClient:function(){return{
    from:q,channel:function(){return{on:function(){return this;},subscribe:function(){}};},
    rpc:function(fn,args){window.__calls.push(['rpc',fn,args]);var me=who&&LOGINS[who];
      if(fn==='is_admin')return Promise.resolve({data:!!(me&&me.admin),error:null});
      if(fn==='current_player_id')return Promise.resolve(window.__noTee?{data:null,error:{message:'function does not exist'}}:{data:me?me.player:null,error:null});
      if(fn==='cast_vote'){ if(!me)return Promise.resolve({data:null,error:{message:'Your login is not linked to a player'}});
        db.scheduling_votes=db.scheduling_votes.filter(function(v){return !(v.slot_id===args.p_slot_id&&v.player_id===me.player);});
        db.scheduling_votes.push({slot_id:args.p_slot_id,player_id:me.player,status:args.p_status});return Promise.resolve({data:null,error:null});}
      if(!me||!me.admin)return Promise.resolve({data:null,error:{message:'Not authorised'}});
      return Promise.resolve({data:null,error:null});},
    auth:{getSession:function(){return Promise.resolve({data:{session:who?{user:{email:who}}:null},error:null});},
      signInWithPassword:function(c){if(!LOGINS[c.email]||c.password!=='pw')return Promise.resolve({data:null,error:{message:'Invalid login credentials'}});who=c.email;return Promise.resolve({data:{},error:null});},
      signOut:function(){who=null;return Promise.resolve({});},onAuthStateChange:function(){}}};}};
})();`;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function open(noTee) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errors.push(e.message));
    if (noTee) await page.addInitScript(() => { window.__noTee = true; });
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.DD_CONFIG={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test',siteUrl:'https://dd.example.com/'};" }));
    await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
    await page.goto(BASE + '/index.html#/tee-sheet');
    return page;
  }
  // --- visitor: can read, cannot vote or organise
  let page = await open(false);
  await page.waitForSelector('.tee-status');
  assert.match(await page.textContent('.tee-status'), /Round 01 — Find a date/i);
  assert.match(await page.textContent('.tee-status'), /1 of 4 players responded/);
  assert.match(await page.textContent('.tee-slots'), /SAT 12 DEC — 7:40 AM/);
  assert.strictEqual(await page.$('.tee-choice'), null, 'visitor gets no vote buttons');
  assert.strictEqual(await page.$('[data-tee="lock"]'), null); assert.strictEqual(await page.$('[data-tee="add-slot"]'), null); assert.strictEqual(await page.$('#demoPlayerSel'), null, 'no name-picker in live mode');
  assert.ok(decodeURIComponent(await page.getAttribute('[data-share="poll"]', 'href')).endsWith('https://dd.example.com/#/tee-sheet'), 'configured site URL used in share link');
  // --- player login: identity comes from the account, vote call carries no player id
  await page.click('.tee-signin [data-tee="sign-in"]');
  await page.fill('#siEmail', 'fitz@example.com'); await page.fill('#siPw', 'pw'); await page.click('#siGo');
  await page.waitForSelector('.tee-choice');
  assert.match(await page.textContent('.tee-as'), /Voting as Fitz/);
  assert.strictEqual(await page.$('[data-tee="lock"]'), null, 'players do not get organiser controls');
  assert.strictEqual(await page.$('[data-tee="cancel-poll"]'), null);
  await page.click('[data-slot-id="sl1"] .tee-choice .maybe');
  await page.click('[data-slot-id="sl2"] .tee-choice .available');
  await page.waitForFunction(() => /2 of 4 players responded/.test(document.querySelector('.tee-status').textContent));
  const votes = await page.evaluate(() => window.__calls.filter((c) => c[1] === 'cast_vote').map((c) => c[2]));
  assert.deepStrictEqual(votes, [{ p_slot_id: 'sl1', p_status: 'maybe' }, { p_slot_id: 'sl2', p_status: 'available' }], 'cast_vote sends only the slot and the answer');
  assert.ok(await page.$('[data-slot-id="sl1"] .tee-voter.maybe'), 'vote visible after reload from the database');
  assert.match(await page.textContent('#footerAuth'), /Fitz/);
  // a player cannot record results
  await page.click('.tab-submit'); await page.waitForSelector('.toast.error');
  assert.match(await page.textContent('.toast.error'), /not an authorised administrator/);
  await page.close();
  // --- organiser login gets the controls
  page = await open(false);
  await page.waitForSelector('.tee-status');
  await page.click('.tee-signin [data-tee="sign-in"]');
  await page.fill('#siEmail', 'jones@example.com'); await page.fill('#siPw', 'pw'); await page.click('#siGo');
  await page.waitForSelector('[data-tee="lock"]');
  assert.ok(await page.$('[data-tee="add-slot"]'));
  await page.close();
  // --- before the migration is run: the rest of the site still works
  page = await open(true);
  await page.waitForSelector('.empty');
  assert.match(await page.textContent('#app'), /one-off database update/);
  await page.goto(BASE + '/index.html#/clubhouse'); await page.waitForSelector('.standings tbody tr');
  assert.strictEqual(await page.$$eval('.standings tbody tr', (r) => r.length), 4);
  await page.goto(BASE + '/index.html#/fixtures'); await page.waitForSelector('.fixture');
  assert.strictEqual(await page.$$eval('.fixture', (r) => r.length), 12);
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Tee Sheet live-mode (mocked Supabase) tests passed');
})().catch((e) => { console.error('TEE SHEET LIVE MOCK FAILED:', e.message); process.exit(1); });
