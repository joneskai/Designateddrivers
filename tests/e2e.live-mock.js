/* Exercises the LIVE (Supabase) code path against a mocked supabase-js client
   shaped like real PostgREST responses. node tests/e2e.live-mock.js http://localhost:8765 */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = process.argv[2] || 'http://localhost:8765';
const FAKE = `
(function(){
  var ids=['jones','fitz','pirie','forrest'], splits=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
  var fixtures=[]; for(var r=1;r<=12;r++){var s=splits[(r-1)%3];
    fixtures.push({id:'fx'+r,season_id:'s1',round_number:r,scheduled_date:r===2?'2030-01-05':null,course:r===2?'Lake Karrinyup':null,
      fixture_teams:[{side:'b',team_members:[{player_id:ids[s[3]]},{player_id:ids[s[2]]}]},{side:'a',team_members:[{player_id:ids[s[1]]},{player_id:ids[s[0]]}]}],
      results:r===1?{score_a:75,score_b:79,played_on:'2026-11-01',notes:null,updated_at:'x'}:null});}
  var db={players:ids.map(function(id,i){return{id:id,name:id[0].toUpperCase()+id.slice(1),color:null,image_url:null,sort_order:i+1};}),
    seasons:[{id:'s1',number:1,name:'Season 01',year:2026,total_rounds:12,status:'active'}],fixtures:fixtures,
    fine_categories:[{id:'c1',name:'Lost ball',default_amount:'2.00',active:true,sort_order:1}],
    fines:[{id:'f1',season_id:'s1',player_id:'pirie',category_id:'c1',fixture_id:'fx1',amount:'2.00',notes:null,created_at:'2026-11-01',fine_categories:{name:'Lost ball'},fine_payments:[{amount:'2.00'}]}]};
  window.__calls=[]; var signed=false;
  function q(table){var p={then:function(res,rej){return Promise.resolve({data:db[table],error:null}).then(res,rej);}};
    ['select','order','eq','update','insert','delete'].forEach(function(m){p[m]=function(){window.__calls.push([table,m].concat([].slice.call(arguments)));return p;};});return p;}
  window.supabase={createClient:function(url,key){window.__key=key;return{
    from:q,channel:function(){return{on:function(){return this;},subscribe:function(){}};},
    rpc:function(fn,args){window.__calls.push(['rpc',fn,args]);
      if(fn==='is_admin')return Promise.resolve({data:signed,error:null});
      if(fn==='save_result'){var f=db.fixtures.filter(function(x){return x.id===args.p_fixture_id;})[0];f.results={score_a:args.p_score_a,score_b:args.p_score_b,played_on:args.p_played_on,notes:args.p_notes};f.course=args.p_course;return Promise.resolve({data:'r',error:null});}
      return Promise.resolve({data:null,error:null});},
    auth:{getSession:function(){return Promise.resolve({data:{session:signed?{user:{email:'admin@example.com'}}:null},error:null});},
      signInWithPassword:function(c){if(c.password!=='pw')return Promise.resolve({data:null,error:{message:'Invalid login credentials'}});signed=true;return Promise.resolve({data:{},error:null});},
      signOut:function(){signed=false;return Promise.resolve({});},onAuthStateChange:function(){}}};}};
})();`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.DD_CONFIG={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test'};" }));
  await page.route('**/vendor/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await page.goto(BASE + '/index.html#/clubhouse');
  await page.waitForSelector('.standings tbody tr');
  assert.ok(await page.$eval('#demoBanner', (b) => b.hidden), 'no demo banner in live mode');
  const pts = await page.$$eval('.standings tbody tr', (rows) => rows.map((r) => r.querySelector('.name').textContent + ':' + r.querySelector('.pts-box').textContent));
  assert.deepStrictEqual(pts, ['Jones:2', 'Fitz:2', 'Pirie:0', 'Forrest:0']);
  assert.match(await page.textContent('.hero-meta'), /01 \/ 12/);
  assert.match(await page.textContent('.hero-meta'), /Lake Karrinyup/);
  assert.match(await page.textContent('.latest-card'), /75 – 79/);
  assert.match(await page.textContent('#footerAuth'), /committee sign in/i);
  // visitor clicking Submit Result must sign in first
  await page.click('.btn-submit');
  await page.waitForSelector('#siEmail');
  await page.fill('#siEmail', 'admin@example.com'); await page.fill('#siPw', 'wrong'); await page.click('#siGo');
  await page.waitForFunction(() => /Invalid login/.test(document.querySelector('#siErr').textContent));
  await page.fill('#siPw', 'pw'); await page.click('#siGo');
  await page.waitForSelector('#srRound');
  await page.fill('#srCourse', 'Lake Karrinyup'); await page.fill('#srA', '81'); await page.fill('#srB', '81');
  await page.click('#srNext'); await page.click('#srSave');
  await page.waitForFunction(() => document.querySelector('.latest-card') && /81 – 81/.test(document.querySelector('.latest-card').textContent));
  const call = await page.evaluate(() => window.__calls.find((c) => c[1] === 'save_result'));
  assert.strictEqual(call[2].p_mode, 'create'); assert.strictEqual(call[2].p_fixture_id, 'fx2');
  const pts2 = await page.$$eval('.standings tbody tr', (rows) => rows.map((r) => r.querySelector('.name').textContent + ':' + r.querySelector('.pts-box').textContent));
  assert.deepStrictEqual(pts2, ['Jones:3', 'Fitz:3', 'Pirie:1', 'Forrest:1']);
  assert.strictEqual(await page.evaluate(() => window.__key), 'sb_publishable_test');
  await page.goto(BASE + '/index.html#/fines');
  assert.match(await page.textContent('.fines-hero-stats'), /\$2/);
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('Live-mode (mocked Supabase) tests passed');
})().catch((e) => { console.error('LIVE MOCK FAILED:', e.message); process.exit(1); });
