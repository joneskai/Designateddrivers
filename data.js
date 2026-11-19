/* =====================================================================
   DESIGNATED DRIVERS — Data layer
   Two interchangeable stores with the same interface:
     • DemoStore      — fictional data kept ONLY in this browser (localStorage)
     • SupabaseStore  — the real, shared, persistent championship
   Demo data can never reach Supabase: the stores share no code paths for writes.
   ===================================================================== */
(function (root) {
  'use strict';
  var E = root.DDEngine;
  var T = root.DDTee;

  var PLAYERS = [
    { id: 'jones',   name: 'Jones',   color: '#D8AF55', image: 'assets/jones.png',   sort: 1 },
    { id: 'fitz',    name: 'Fitz',    color: '#1F5A3D', image: 'assets/fitz.png',    sort: 2 },
    { id: 'pirie',   name: 'Pirie',   color: '#7C9FCB', image: 'assets/pirie.png',   sort: 3 },
    { id: 'forrest', name: 'Forrest', color: '#EC8A78', image: 'assets/forrest.png', sort: 4 }
  ];

  var DEFAULT_CATEGORIES = [
    ['Not at course 10 mins before tee-off', 5], ['No-show', 20], ['Ball in water', 2], ['Fails to pass ladies’ tees', 5], ['Air swing', 5]
  ];

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------
     DEMO STORE (fictional — clearly labelled in the UI)
     ------------------------------------------------------------------ */
  var DEMO_KEY = 'dd-demo-data-v5';

  function buildDemo() {
    var seasonId = 'demo-season-1';
    var ids = PLAYERS.map(function (p) { return p.id; });
    var schedule = E.generateSchedule(ids, 12);
    var dates = ['2026-10-11', '2026-10-25', '2026-11-08', '2026-11-15', '2026-11-29', '2026-12-13',
                 '2027-01-10', '2027-01-24', '2027-02-07', '2027-02-21', '2027-03-07', '2027-03-21'];
    var courses = ['Hamersley Public Golf Course', 'Collier Park Golf Course', 'Point Walter Golf Course', 'Wembley Golf Course',
                   'Lake Karrinyup', 'Joondalup Resort', 'Marangaroo Golf Course', 'Araluen Estate', '', '', '', ''];
    var results = { 1: [79, 84, 'Fitz holed out from the trap on 17.'], 2: [81, 85, ''], 3: [82, 82, 'All square — nobody will stop talking about the 18th.'], 4: [78, 83, ''] };
    var fixtures = schedule.map(function (s) {
      var r = results[s.round];
      return {
        id: 'demo-fx-' + s.round, seasonId: seasonId, round: s.round,
        date: r ? dates[s.round - 1] : null, course: r ? courses[s.round - 1] : '', teeTime: null, teeWeeks: T.INITIAL_WEEKS,
        teamA: s.teamA, teamB: s.teamB,
        status: r ? 'completed' : 'scheduled',
        scoreA: r ? r[0] : null, scoreB: r ? r[1] : null, notes: r ? r[2] : ''
      };
    });
    var cats = DEFAULT_CATEGORIES.map(function (c, i) { return { id: 'demo-cat-' + (i + 1), name: c[0], amount: c[1], active: true, sort: i + 1 }; });
    function cat(name) { return cats.filter(function (c) { return c.name === name; })[0]; }
    var fines = [
      ['forrest', 'Not at course 10 mins before tee-off', 1, true, 'Fictional demo fine.'],
      ['pirie', 'Fails to pass ladies’ tees', 2, false, ''],
      ['forrest', 'Ball in water', 2, true, ''],
      ['fitz', 'Air swing', 3, false, ''],
      ['forrest', 'Ball in water', 4, false, ''],
      ['pirie', 'Air swing', 4, false, '']
    ].map(function (x, i) {
      var c = cat(x[1]);
      return { id: 'demo-fine-' + (i + 1), seasonId: seasonId, playerId: x[0], categoryId: c.id, categoryName: c.name, fixtureId: 'demo-fx-' + x[2], amount: c.amount, paid: x[3], notes: x[4], createdAt: dates[x[2] - 1] + 'T09:00:00Z' };
    });
    return {
      players: clone(PLAYERS).map(function (p) { p.quote = ''; p.bestShot = ''; p.strength = ''; p.weakness = ''; return p; }),
      seasons: [{ id: seasonId, number: 1, name: 'Season 01', year: 2026, totalRounds: 12, status: 'active' }],
      fixtures: fixtures, fineCategories: cats, fines: fines,
      tee: { ready: true }, availability: demoAvailability(dates[3]), proposals: []
    };
  }

  /* Fictional Round 05 availability: three players have answered, Forrest hasn't. */
  function demoAvailability(lastPlayed) {
    var w = T.windowFor({ lastPlayed: lastPlayed, today: T.today() }).weekends, b = T.bit;
    var FRI = 0, SAT = 1, SUN = 2, EA = 0, LA = 1, LU = 2, EP = 3, TW = 4;
    var rows = [
      ['jones', 0, b(SAT, EA) | b(SAT, LA) | b(SUN, LA) | b(FRI, TW)],
      ['fitz', 0, b(SAT, EA) | b(SUN, LA) | b(SUN, EP)],
      ['pirie', 0, b(SAT, EA) | b(SAT, LA) | b(SUN, LA)],
      ['jones', 1, b(SAT, EA) | b(SUN, LA)],
      ['fitz', 1, b(SAT, EA) | b(SAT, LU)]
    ];
    return rows.map(function (x) { return { playerId: x[0], weekend: w[x[1]], mask: x[2] }; });
  }

  function DemoStore() { this.mode = 'demo'; }
  DemoStore.prototype._read = function () {
    try { var raw = localStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* storage unavailable */ }
    return this._mem || buildDemo();
  };
  DemoStore.prototype._write = function (d) {
    this._mem = d;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) { /* memory only */ }
  };
  DemoStore.prototype._mutate = function (fn) {
    var d = this._read(), res;
    try { res = fn(d); } catch (e) { return Promise.reject(e); }   // nothing is written when a rule is broken
    this._write(d);
    return new Promise(function (r) { setTimeout(function () { r(res); }, 250); });
  };
  DemoStore.prototype.load = function () { var d = this._read(); d.tee = { ready: true }; d.availability = d.availability || []; d.proposals = d.proposals || []; this._write(d); return Promise.resolve(clone(d)); };
  DemoStore.prototype.reset = function () { try { localStorage.removeItem(DEMO_KEY); } catch (e) {} this._mem = null; return this.load(); };
  DemoStore.prototype.onChange = function () {};

  DemoStore.prototype.saveResult = function (p) {
    return this._mutate(function (d) {
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (!f) throw new Error('Fixture not found.');
      if (p.mode === 'create' && f.status === 'completed') throw new Error('Round ' + f.round + ' already has a result. Edit it from the Fixtures page instead.');
      if (f.status !== 'completed') f.plannedDate = f.date || null;      // like fixtures.scheduled_date vs results.played_on
      f.status = 'completed'; f.scoreA = p.scoreA; f.scoreB = p.scoreB; f.date = p.date; f.course = p.course; f.notes = p.notes || '';
      f.updatedAt = new Date().toISOString();
      return f;
    });
  };
  DemoStore.prototype.deleteResult = function (fixtureId) {
    return this._mutate(function (d) {
      var f = d.fixtures.filter(function (x) { return x.id === fixtureId; })[0];
      if (f.status === 'completed') f.date = f.plannedDate || null;      // back to the planned date, not the played one
      f.status = 'scheduled'; f.scoreA = null; f.scoreB = null; f.notes = '';
    });
  };
  DemoStore.prototype.updateFixture = function (p) {
    return this._mutate(function (d) {
      var f = d.fixtures.filter(function (x) { return x.id === p.id; })[0];
      f.date = p.date || null; f.course = p.course || '';
    });
  };
  DemoStore.prototype.swapPairings = function (idA, idB) {
    return this._mutate(function (d) {
      var a = d.fixtures.filter(function (x) { return x.id === idA; })[0];
      var b = d.fixtures.filter(function (x) { return x.id === idB; })[0];
      if (a.status === 'completed' || b.status === 'completed') throw new Error('Only unplayed rounds can swap pairings.');
      var ta = a.teamA, tb = a.teamB; a.teamA = b.teamA; a.teamB = b.teamB; b.teamA = ta; b.teamB = tb;
    });
  };
  DemoStore.prototype.addFine = function (f) {
    return this._mutate(function (d) {
      var c = d.fineCategories.filter(function (x) { return x.id === f.categoryId; })[0];
      if (!c) throw new Error('Choose an offence');
      var amount = f.amount === '' || f.amount == null ? c.amount : Number(f.amount);
      var twin = d.fines.filter(function (x) { return x.playerId === f.playerId && x.categoryId === f.categoryId && (x.fixtureId || null) === (f.fixtureId || null) && x.amount === amount && Date.now() - new Date(x.createdAt).getTime() < 10000; })[0];
      if (twin) throw new Error('That fine was recorded a moment ago — not adding it twice.');
      d.fines.push({ id: uid(), seasonId: f.seasonId, playerId: f.playerId, categoryId: f.categoryId, categoryName: c.name, fixtureId: f.fixtureId || null, amount: amount, paid: !!f.paid, notes: f.notes || '', createdAt: new Date().toISOString() });
    });
  };
  DemoStore.prototype.updateFine = function (id, f) {
    return this._mutate(function (d) {
      var x = d.fines.filter(function (y) { return y.id === id; })[0]; if (!x) throw new Error('Fine not found');
      var c = d.fineCategories.filter(function (y) { return y.id === f.categoryId; })[0];
      x.playerId = f.playerId; x.categoryId = f.categoryId; x.categoryName = c ? c.name : x.categoryName; x.fixtureId = f.fixtureId || null; x.amount = Number(f.amount); x.notes = f.notes || '';
    });
  };
  DemoStore.prototype.setFinePaid = function (id, paid) {
    return this._mutate(function (d) { var x = d.fines.filter(function (y) { return y.id === id; })[0]; if (!x) throw new Error('Fine not found'); x.paid = !!paid; });
  };
  DemoStore.prototype.deleteFine = function (id) {
    return this._mutate(function (d) { d.fines = d.fines.filter(function (x) { return x.id !== id; }); });
  };
  DemoStore.prototype.updatePlayerProfile = function (id, f) {
    return this._mutate(function (d) {
      var p = d.players.filter(function (x) { return x.id === id; })[0]; if (!p) throw new Error('Player not found');
      ['quote', 'bestShot', 'strength', 'weakness'].forEach(function (k) { var v = String(f[k] || '').trim(); if (v.length > 140) throw new Error('Keep each answer under 140 characters'); p[k] = v; });
    });
  };
  /* ---- Tee Time (demo) — mirrors the rules in the database functions ---- */
  function dFixture(d, id) { var f = d.fixtures.filter(function (x) { return x.id === id; })[0]; if (!f) throw new Error('Fixture not found'); return f; }
  function dProposal(d, id) { var p = d.proposals.filter(function (x) { return x.id === id; })[0]; if (!p) throw new Error('That proposal no longer exists — refresh.'); return p; }
  function inFixture(f, pid) { return f.teamA.concat(f.teamB).indexOf(pid) !== -1; }
  DemoStore.prototype.setAvailability = function (playerId, changes) {
    return this._mutate(function (d) {
      if (!d.players.some(function (p) { return p.id === playerId; })) throw new Error('Choose a player');
      if (!changes || !changes.length) throw new Error('Nothing to save');
      return changes.map(function (ch) {
        if (!T.isFriday(ch.w)) throw new Error('Availability is saved by weekend, starting Friday');
        var row = d.availability.filter(function (a) { return a.playerId === playerId && a.weekend === ch.w; })[0];
        if (!row) { row = { playerId: playerId, weekend: ch.w, mask: 0 }; d.availability.push(row); }
        row.mask = T.apply(row.mask, ch.s, ch.c);
        return { w: ch.w, mask: row.mask };
      });
    });
  };
  DemoStore.prototype.extendWindow = function (fixtureId) {
    return this._mutate(function (d) { var f = dFixture(d, fixtureId); f.teeWeeks = Math.min((f.teeWeeks || T.INITIAL_WEEKS) + T.EXTEND_BY, T.MAX_WEEKS); return f.teeWeeks; });
  };
  DemoStore.prototype.proposeRound = function (p) {
    return this._mutate(function (d) {
      var f = dFixture(d, p.fixtureId);
      if (f.status === 'completed') throw new Error('That round has already been played');
      if ([5, 6, 0].indexOf(T.dow(p.date)) === -1) throw new Error('Rounds are played Friday to Sunday');
      if (d.proposals.some(function (x) { return x.fixtureId === f.id && x.status !== 'withdrawn'; })) throw new Error('This round has already been proposed — refresh to see it.');
      var resp = {}; if (p.playerId && inFixture(f, p.playerId)) resp[p.playerId] = 'yes';
      var prop = { id: uid(), fixtureId: f.id, date: p.date, slot: p.slot, status: 'open', proposedBy: p.playerId || null, teeTime: null, course: '', createdAt: new Date().toISOString(), responses: resp };
      d.proposals.push(prop);
      return prop.id;
    });
  };
  DemoStore.prototype.respondProposal = function (id, playerId, response) {
    return this._mutate(function (d) {
      var p = dProposal(d, id);
      if (p.status !== 'open') throw new Error('This proposal is no longer open for replies.');
      if (!inFixture(dFixture(d, p.fixtureId), playerId)) throw new Error('Unknown player');
      p.responses[playerId] = response;
    });
  };
  DemoStore.prototype.withdrawProposal = function (id) {
    return this._mutate(function (d) {
      var p = dProposal(d, id), f = dFixture(d, p.fixtureId);
      if (p.status === 'scheduled' && f.status !== 'completed') { f.date = null; f.teeTime = null; }
      p.status = 'withdrawn';
    });
  };
  DemoStore.prototype.scheduleFixture = function (id, b) {
    return this._mutate(function (d) {
      var p = dProposal(d, id), f = dFixture(d, p.fixtureId);
      if (p.status === 'withdrawn') throw new Error('That proposal was withdrawn — refresh.');
      if (f.status === 'completed') throw new Error('That round has already been played');
      var waiting = f.teamA.concat(f.teamB).filter(function (pid) { return p.responses[pid] !== 'yes'; });
      if (waiting.length) throw new Error('Still waiting for ' + waiting.map(function (w) { return d.players.filter(function (x) { return x.id === w; })[0].name; }).join(', ') + ' to confirm');
      if (!b.teeTime) throw new Error('Enter the tee-off time');
      if (!String(b.course || '').trim()) throw new Error('Golf course is required');
      p.status = 'scheduled'; p.teeTime = b.teeTime; p.course = b.course.trim();
      f.date = p.date; f.teeTime = b.teeTime; f.course = p.course;
    });
  };

  DemoStore.prototype.saveCategory = function (c) {
    return this._mutate(function (d) {
      if (c.id) { var x = d.fineCategories.filter(function (y) { return y.id === c.id; })[0]; x.name = c.name; x.amount = Number(c.amount); x.active = c.active !== false; }
      else d.fineCategories.push({ id: uid(), name: c.name, amount: Number(c.amount), active: true, sort: d.fineCategories.length + 1 });
    });
  };

  /* ------------------------------------------------------------------
     SUPABASE STORE (production) — no logins.
     Reads use the public, read-only table policies. Every WRITE is a call to
     one of the guarded database functions in supabase-schema.sql, which
     validate input, rate-limit, refuse duplicates and keep an undo trail.
     ------------------------------------------------------------------ */
  var CODE_KEY = 'dd-club-code';
  function SupabaseStore(cfg) {
    this.mode = 'live';
    this.askCode = null;   // set by the app: () => Promise<string|null>, used only if a club code is switched on
    this.sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  function check(res) {
    if (!res.error) return res.data;
    var m = res.error.message || 'Database error';
    if (/could not find the function|schema cache|does not exist/i.test(m)) m = 'The database needs updating: run the latest supabase-schema.sql in the Supabase SQL Editor (see README).';
    throw new Error(m);
  }
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function storedCode() { try { return localStorage.getItem(CODE_KEY) || null; } catch (e) { return null; } }

  SupabaseStore.prototype.load = async function () {
    var sb = this.sb;
    // Tee Time tables arrive with the latest supabase-schema.sql; everything else works without them.
    var tee = await Promise.all([
      sb.from('availability').select('player_id,weekend,mask').gte('weekend', T.addDays(T.today(), -120)),
      sb.from('tee_proposals').select('*').order('created_at'),
      sb.from('tee_responses').select('proposal_id,player_id,response')
    ]);
    var teeReady = !tee.some(function (x) { return x.error; });
    var r = await Promise.all([
      sb.from('players').select('*').order('sort_order'),
      sb.from('seasons').select('id,number,name,year,total_rounds,status').order('number'),
      sb.from('fixtures').select('*,fixture_teams(side,team_members(player_id)),results(score_a,score_b,played_on,notes,updated_at)').order('round_number'),
      sb.from('fine_categories').select('id,name,default_amount,active,sort_order').order('sort_order'),
      sb.from('fines').select('id,season_id,player_id,category_id,fixture_id,amount,notes,created_at,fine_categories(name),fine_payments(amount)').order('created_at')
    ]);
    var players = check(r[0]).map(function (p) {
      var base = PLAYERS.filter(function (x) { return x.id === p.id; })[0] || {};
      return { id: p.id, name: p.name, color: p.color || base.color || '#888', image: p.image_url || base.image || ('assets/' + p.id + '.png'), sort: p.sort_order, quote: p.quote || '', bestShot: p.best_shot || '', strength: p.strength || '', weakness: p.weakness || '' };
    });
    var seasons = check(r[1]).map(function (s) { return { id: s.id, number: s.number, name: s.name, year: s.year, totalRounds: s.total_rounds, status: s.status }; });
    var order = function (x, y) { return players.findIndex(function (p) { return p.id === x; }) - players.findIndex(function (p) { return p.id === y; }); };
    var fixtures = check(r[2]).map(function (f) {
      var teams = { a: [], b: [] };
      (f.fixture_teams || []).forEach(function (t) { teams[t.side] = (t.team_members || []).map(function (m) { return m.player_id; }).sort(order); });
      var res = one(f.results);
      return {
        id: f.id, seasonId: f.season_id, round: f.round_number,
        date: (res && res.played_on) || f.scheduled_date || null, course: f.course || '',
        teeTime: f.tee_time ? String(f.tee_time).slice(0, 5) : null, teeWeeks: f.tee_weeks || T.INITIAL_WEEKS,
        teamA: teams.a, teamB: teams.b, status: res ? 'completed' : 'scheduled',
        scoreA: res ? res.score_a : null, scoreB: res ? res.score_b : null, notes: res ? (res.notes || '') : '', updatedAt: res ? res.updated_at : null
      };
    });
    var cats = check(r[3]).map(function (c) { return { id: c.id, name: c.name, amount: Number(c.default_amount), active: c.active, sort: c.sort_order }; });
    var fines = check(r[4]).map(function (f) {
      var paidAmt = (f.fine_payments || []).reduce(function (t, p) { return t + Number(p.amount); }, 0);
      return { id: f.id, seasonId: f.season_id, playerId: f.player_id, categoryId: f.category_id, categoryName: f.fine_categories ? one(f.fine_categories).name : 'Other', fixtureId: f.fixture_id, amount: Number(f.amount), paid: Number(f.amount) > 0 ? paidAmt >= Number(f.amount) - 0.001 : false, notes: f.notes || '', createdAt: f.created_at };
    });
    var availability = [], proposals = [];
    if (teeReady) {
      availability = tee[0].data.map(function (a) { return { playerId: a.player_id, weekend: a.weekend, mask: a.mask }; });
      proposals = tee[1].data.map(function (p) {
        var resp = {}; tee[2].data.forEach(function (x) { if (x.proposal_id === p.id) resp[x.player_id] = x.response; });
        return { id: p.id, fixtureId: p.fixture_id, date: p.play_date, slot: p.slot, status: p.status, proposedBy: p.proposed_by, teeTime: p.tee_time ? String(p.tee_time).slice(0, 5) : null, course: p.course || '', createdAt: p.created_at, responses: resp };
      });
    }
    return { players: players, seasons: seasons, fixtures: fixtures, fineCategories: cats, fines: fines, tee: { ready: teeReady }, availability: availability, proposals: proposals };
  };
  SupabaseStore.prototype.onChange = function (cb) {
    // Optional realtime refresh (enable Realtime on the tables in Supabase to use it)
    try {
      var ch = this.sb.channel('dd-changes');
      ['results', 'fixtures', 'fines', 'fine_payments', 'team_members', 'fine_categories', 'seasons', 'availability', 'tee_proposals', 'tee_responses'].forEach(function (t) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, function () { cb(); });
      });
      ch.subscribe();
    } catch (e) { /* realtime is optional */ }
  };

  /** Call a guarded write function. If the optional club code is on, ask for it once per device and retry. */
  SupabaseStore.prototype._write = async function (fn, args) {
    var self = this;
    async function attempt(code) { return self.sb.rpc(fn, Object.assign({}, args, { p_code: code })); }
    var res = await attempt(storedCode());
    if (res.error && /CLUB_CODE_REQUIRED/.test(res.error.message || '') && this.askCode) {
      try { localStorage.removeItem(CODE_KEY); } catch (e) {}
      var code = await this.askCode();
      if (!code) throw new Error('A club code is needed to make changes.');
      res = await attempt(code);
      if (res.error && /CLUB_CODE_REQUIRED/.test(res.error.message || '')) throw new Error('That club code isn’t right.');
      if (!res.error) { try { localStorage.setItem(CODE_KEY, code); } catch (e) {} }
    }
    return check(res);
  };
  SupabaseStore.prototype.saveResult = function (p) {
    return this._write('save_result', { p_fixture_id: p.fixtureId, p_played_on: p.date, p_course: p.course, p_score_a: p.scoreA, p_score_b: p.scoreB, p_notes: p.notes || null, p_mode: p.mode });
  };
  SupabaseStore.prototype.deleteResult = function (fixtureId) { return this._write('delete_result', { p_fixture_id: fixtureId }); };
  SupabaseStore.prototype.updateFixture = function (p) { return this._write('update_fixture', { p_fixture_id: p.id, p_date: p.date || null, p_course: p.course || null }); };
  SupabaseStore.prototype.swapPairings = function (a, b) { return this._write('swap_fixture_pairings', { p_fixture_a: a, p_fixture_b: b }); };
  SupabaseStore.prototype.addFine = function (f) {
    return this._write('add_fine', { p_season_id: f.seasonId, p_player_id: f.playerId, p_category_id: f.categoryId, p_fixture_id: f.fixtureId || null, p_amount: f.amount === '' || f.amount == null ? null : Number(f.amount), p_notes: f.notes || null, p_paid: !!f.paid });
  };
  SupabaseStore.prototype.updateFine = function (id, f) {
    return this._write('update_fine', { p_fine_id: id, p_player_id: f.playerId, p_category_id: f.categoryId, p_fixture_id: f.fixtureId || null, p_amount: Number(f.amount), p_notes: f.notes || null });
  };
  SupabaseStore.prototype.setFinePaid = function (id, paid) { return this._write('set_fine_paid', { p_fine_id: id, p_paid: !!paid }); };
  SupabaseStore.prototype.deleteFine = function (id) { return this._write('delete_fine', { p_fine_id: id }); };
  SupabaseStore.prototype.updatePlayerProfile = function (id, f) {
    return this._write('update_player_profile', { p_player_id: id, p_quote: f.quote || null, p_best_shot: f.bestShot || null, p_strength: f.strength || null, p_weakness: f.weakness || null });
  };
  SupabaseStore.prototype.setAvailability = function (playerId, changes) { return this._write('set_availability', { p_player_id: playerId, p_changes: changes }); };
  SupabaseStore.prototype.extendWindow = function (fixtureId) { return this._write('extend_availability', { p_fixture_id: fixtureId }); };
  SupabaseStore.prototype.proposeRound = function (p) { return this._write('propose_round', { p_fixture_id: p.fixtureId, p_date: p.date, p_slot: p.slot, p_player_id: p.playerId || null }); };
  SupabaseStore.prototype.respondProposal = function (id, playerId, response) { return this._write('respond_proposal', { p_proposal_id: id, p_player_id: playerId, p_response: response }); };
  SupabaseStore.prototype.withdrawProposal = function (id) { return this._write('withdraw_proposal', { p_proposal_id: id }); };
  SupabaseStore.prototype.scheduleFixture = function (id, b) { return this._write('schedule_fixture', { p_proposal_id: id, p_tee_time: b.teeTime, p_course: b.course }); };
  SupabaseStore.prototype.saveCategory = function (c) { return this._write('save_fine_category', { p_id: c.id || null, p_name: c.name, p_amount: Number(c.amount), p_active: c.active !== false }); };

  root.DDData = {
    PLAYERS: PLAYERS, DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    buildDemo: buildDemo, DemoStore: DemoStore, SupabaseStore: SupabaseStore
  };
})(typeof self !== 'undefined' ? self : this);
