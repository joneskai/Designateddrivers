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
    ['Fails to pass the forward tees', 5], ['Late to tee-off', 10], ['Lost ball', 2], ['Three-putt', 2],
    ['Club thrown in anger', 5], ['Water hazard', 2], ['Air swing', 5], ['Blames equipment', 2],
    ['Incorrect score reported', 10], ['No-show', 20]
  ];

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------
     DEMO STORE (fictional — clearly labelled in the UI)
     ------------------------------------------------------------------ */
  var DEMO_KEY = 'dd-demo-data-v2';
  var DEMO_PLAYER_KEY = 'dd-demo-player';

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
        date: s.round === 5 ? null : (dates[s.round - 1] || null), course: s.round === 5 ? '' : (courses[s.round - 1] || ''), teeTime: null,
        teamA: s.teamA, teamB: s.teamB,
        status: r ? 'completed' : 'scheduled',
        scoreA: r ? r[0] : null, scoreB: r ? r[1] : null, notes: r ? r[2] : ''
      };
    });
    var cats = DEFAULT_CATEGORIES.map(function (c, i) { return { id: 'demo-cat-' + (i + 1), name: c[0], amount: c[1], active: true, sort: i + 1 }; });
    function cat(name) { return cats.filter(function (c) { return c.name === name; })[0]; }
    var fines = [
      ['forrest', 'Late to tee-off', 1, true, 'Claimed the Mitchell Fwy was “unusually hostile”.'],
      ['pirie', 'Fails to pass the forward tees', 2, false, 'Ladies’ tee, 4th hole. Witnessed by all.'],
      ['forrest', 'Water hazard', 2, true, ''],
      ['fitz', 'Blames equipment', 3, false, 'Blamed a brand-new putter for a 2-foot miss.'],
      ['forrest', 'Three-putt', 4, false, ''],
      ['pirie', 'Air swing', 4, false, 'Practice swing, allegedly.']
    ].map(function (x, i) {
      var c = cat(x[1]);
      return { id: 'demo-fine-' + (i + 1), seasonId: seasonId, playerId: x[0], categoryId: c.id, categoryName: c.name, fixtureId: 'demo-fx-' + x[2], amount: c.amount, paid: x[3], notes: x[4], createdAt: dates[x[2] - 1] + 'T09:00:00Z' };
    });
    return {
      players: clone(PLAYERS),
      seasons: [{ id: seasonId, number: 1, name: 'Season 01', year: 2026, totalRounds: 12, status: 'active' }],
      fixtures: fixtures, fineCategories: cats, fines: fines,
      scheduling: { ready: true }, polls: [demoPoll(seasonId)]
    };
  }

  /* Fictional Round 05 poll: three of four have answered, Forrest is holding everyone up. */
  function demoPoll(seasonId) {
    var slots = [
      ['2026-12-05', 'morning', null, { jones: 'available', fitz: 'available', pirie: 'maybe' }, false],
      ['2026-12-06', 'afternoon', null, { jones: 'available', fitz: 'unavailable', pirie: 'available' }, false],
      ['2026-12-12', 'morning', null, { jones: 'available', fitz: 'available', pirie: 'available' }, true],
      ['2026-12-13', 'anytime', null, { jones: 'maybe', fitz: 'available', pirie: 'available' }, false]
    ].map(function (x, i) { return { id: 'demo-slot-' + (i + 1), date: x[0], window: x[1], startTime: x[2], notes: '', preferred: x[4], votes: x[3] }; });
    return {
      id: 'demo-poll-5', seasonId: seasonId, fixtureId: 'demo-fx-5', status: 'polling', timezone: T.DEFAULT_TZ,
      deadline: '2026-12-04T10:00:00.000Z', closeAtDeadline: false, notes: 'Lake Karrinyup or Wembley, whichever has a slot.',
      agreedSlotId: null, agreedAt: null, teeDate: null, teeTime: null, course: '', bookingRef: '', bookingNotes: '', durationMinutes: T.DEFAULT_DURATION,
      confirmedAt: null, createdAt: '2026-11-16T02:00:00.000Z', slots: slots, agreements: [],
      events: [{ type: 'poll_opened', at: '2026-11-16T02:00:00.000Z', playerId: 'jones', data: { slots: 4 } }]
    };
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
  DemoStore.prototype.load = function () { var d = this._read(); d.polls = d.polls || []; d.scheduling = { ready: true }; this._write(d); return Promise.resolve(clone(d)); };
  DemoStore.prototype.reset = function () { try { localStorage.removeItem(DEMO_KEY); localStorage.removeItem(DEMO_PLAYER_KEY); } catch (e) {} this._demoPlayer = null; this._mem = null; return this.load(); };
  DemoStore.prototype.demoPlayer = function () { var v = null; try { v = localStorage.getItem(DEMO_PLAYER_KEY); } catch (e) {} return v || this._demoPlayer || 'forrest'; };
  DemoStore.prototype.setDemoPlayer = function (id) { this._demoPlayer = id; try { localStorage.setItem(DEMO_PLAYER_KEY, id); } catch (e) {} };
  DemoStore.prototype.session = function () { return Promise.resolve({ email: 'demo@designated.drivers', admin: true, playerId: this.demoPlayer() }); };
  DemoStore.prototype.signIn = function () { return Promise.resolve({ admin: true }); };
  DemoStore.prototype.signOut = function () { return Promise.resolve(); };
  DemoStore.prototype.onChange = function () {};

  DemoStore.prototype.saveResult = function (p) {
    return this._mutate(function (d) {
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (!f) throw new Error('Fixture not found.');
      if (p.mode === 'create' && f.status === 'completed') throw new Error('Round ' + f.round + ' already has a result. Edit it from the Fixtures page instead.');
      f.status = 'completed'; f.scoreA = p.scoreA; f.scoreB = p.scoreB; f.date = p.date; f.course = p.course; f.notes = p.notes || '';
      f.updatedAt = new Date().toISOString();
      return f;
    });
  };
  DemoStore.prototype.deleteResult = function (fixtureId) {
    return this._mutate(function (d) {
      var f = d.fixtures.filter(function (x) { return x.id === fixtureId; })[0];
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
  DemoStore.prototype.addFines = function (list) {
    return this._mutate(function (d) {
      list.forEach(function (f) {
        var c = d.fineCategories.filter(function (x) { return x.id === f.categoryId; })[0];
        d.fines.push({ id: uid(), seasonId: f.seasonId, playerId: f.playerId, categoryId: f.categoryId, categoryName: c ? c.name : 'Other', fixtureId: f.fixtureId || null, amount: Number(f.amount), paid: !!f.paid, notes: f.notes || '', createdAt: new Date().toISOString() });
      });
    });
  };
  DemoStore.prototype.updateFine = function (id, patch) {
    return this._mutate(function (d) {
      var f = d.fines.filter(function (x) { return x.id === id; })[0];
      Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
      if (patch.categoryId) { var c = d.fineCategories.filter(function (x) { return x.id === patch.categoryId; })[0]; f.categoryName = c ? c.name : f.categoryName; }
    });
  };
  DemoStore.prototype.deleteFine = function (id) {
    return this._mutate(function (d) { d.fines = d.fines.filter(function (x) { return x.id !== id; }); });
  };
  DemoStore.prototype.saveCategory = function (c) {
    return this._mutate(function (d) {
      if (c.id) { var x = d.fineCategories.filter(function (y) { return y.id === c.id; })[0]; x.name = c.name; x.amount = Number(c.amount); x.active = c.active !== false; }
      else d.fineCategories.push({ id: uid(), name: c.name, amount: Number(c.amount), active: true, sort: d.fineCategories.length + 1 });
    });
  };
  DemoStore.prototype.createSeason = function (p) {
    return this._mutate(function (d) {
      var n = d.seasons.reduce(function (m, s) { return Math.max(m, s.number); }, 0) + 1;
      var id = uid();
      d.seasons.push({ id: id, number: n, name: p.name || ('Season ' + String(n).padStart(2, '0')), year: p.year, totalRounds: 12, status: 'active' });
      E.generateSchedule(d.players.map(function (x) { return x.id; }), 12).forEach(function (s) {
        d.fixtures.push({ id: uid(), seasonId: id, round: s.round, date: null, course: '', teamA: s.teamA, teamB: s.teamB, status: 'scheduled', scoreA: null, scoreB: null, notes: '' });
      });
      return id;
    });
  };
  DemoStore.prototype.setSeasonStatus = function (id, status) {
    return this._mutate(function (d) { d.seasons.filter(function (s) { return s.id === id; })[0].status = status; });
  };


  /* ---- Tee Sheet (demo) — mirrors the rules enforced by the SQL functions ---- */
  function dPoll(d, id) { var p = (d.polls || []).filter(function (x) { return x.id === id; })[0]; if (!p) throw new Error('Poll not found'); return p; }
  function dSlot(d, slotId) {
    var hit = null;
    (d.polls || []).forEach(function (p) { p.slots.forEach(function (s) { if (s.id === slotId) hit = { poll: p, slot: s }; }); });
    if (!hit) throw new Error('That date is no longer on the tee sheet');
    return hit;
  }
  function dLog(store, poll, type, data) { poll.events.push({ type: type, at: new Date().toISOString(), playerId: store.demoPlayer(), data: data || {} }); }
  function dAddSlot(poll, s) {
    var errs = T.validateSlot(s); if (errs.length) throw new Error(errs[0]);
    if (poll.slots.some(function (x) { return T.slotKey(x) === T.slotKey(s); })) throw new Error('That date and time is already on the tee sheet');
    poll.slots.push({ id: uid(), date: s.date, window: s.window, startTime: s.window === 'time' ? s.startTime : null, notes: s.notes || '', preferred: false, votes: {} });
  }
  DemoStore.prototype.createPoll = function (p) {
    var self = this;
    return this._mutate(function (d) {
      d.polls = d.polls || [];
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (!f) throw new Error('Fixture not found');
      if (f.status === 'completed') throw new Error('That round has already been played');
      if (T.activePoll(d.polls, p.fixtureId)) throw new Error('This round already has a scheduling poll');
      if (!p.slots || !p.slots.length) throw new Error('Propose at least one date');
      var poll = { id: uid(), seasonId: f.seasonId, fixtureId: f.id, status: 'polling', timezone: p.timezone || T.DEFAULT_TZ, deadline: p.deadline || null, closeAtDeadline: !!p.closeAtDeadline, notes: p.notes || '',
        agreedSlotId: null, agreedAt: null, teeDate: null, teeTime: null, course: '', bookingRef: '', bookingNotes: '', durationMinutes: T.DEFAULT_DURATION, confirmedAt: null, createdAt: new Date().toISOString(), slots: [], agreements: [], events: [] };
      p.slots.forEach(function (s) { dAddSlot(poll, s); });
      dLog(self, poll, 'poll_opened', { slots: poll.slots.length });
      d.polls.push(poll);
      return poll.id;
    });
  };
  DemoStore.prototype.addSlot = function (pollId, s) {
    var self = this;
    return this._mutate(function (d) { var p = dPoll(d, pollId); if (p.status !== 'polling') throw new Error('Dates can only be added while voting is open'); dAddSlot(p, s); dLog(self, p, 'slot_added', { date: s.date, window: s.window, start_time: s.startTime || null }); });
  };
  DemoStore.prototype.removeSlot = function (slotId) {
    var self = this;
    return this._mutate(function (d) { var h = dSlot(d, slotId); if (h.poll.status !== 'polling') throw new Error('Dates can only be removed while voting is open'); dLog(self, h.poll, 'slot_removed', { date: h.slot.date, window: h.slot.window, votes: h.slot.votes }); h.poll.slots = h.poll.slots.filter(function (s) { return s.id !== slotId; }); });
  };
  DemoStore.prototype.setSlotPreferred = function (slotId, on) { return this._mutate(function (d) { dSlot(d, slotId).slot.preferred = !!on; }); };
  DemoStore.prototype.updatePoll = function (pollId, patch) {
    var self = this;
    return this._mutate(function (d) { var p = dPoll(d, pollId); if (p.status !== 'polling') throw new Error('Poll is not open'); p.deadline = patch.deadline || null; p.closeAtDeadline = !!patch.closeAtDeadline; p.notes = patch.notes || ''; dLog(self, p, 'poll_updated', { deadline: p.deadline }); });
  };
  function dVote(d, slotId, playerId, status, strictDeadline) {
    if (T.STATUSES.indexOf(status) === -1) throw new Error('Unknown availability');
    var h = dSlot(d, slotId);
    if (h.poll.status !== 'polling') throw new Error('Voting is closed for this round');
    if (strictDeadline && !T.votingOpen(h.poll)) throw new Error('The voting deadline has passed');
    h.slot.votes[playerId] = status;   // one vote per player per slot — the latest replaces the last
    return h;
  }
  DemoStore.prototype.castVote = function (slotId, status) { var me = this.demoPlayer(); return this._mutate(function (d) { dVote(d, slotId, me, status, true); }); };
  DemoStore.prototype.adminSetVote = function (slotId, playerId, status) {
    var self = this;
    return this._mutate(function (d) { var h = dVote(d, slotId, playerId, status, false); dLog(self, h.poll, 'vote_corrected', { player: playerId, status: status, date: h.slot.date }); });
  };
  DemoStore.prototype.lockIn = function (pollId, slotId) {
    var self = this;
    return this._mutate(function (d) {
      var p = dPoll(d, pollId); if (p.status !== 'polling') throw new Error('A date can only be locked in while voting is open');
      var s = p.slots.filter(function (x) { return x.id === slotId; })[0]; if (!s) throw new Error('That date is not part of this poll');
      var ids = d.players.map(function (x) { return x.id; });
      if (!T.classifySlot(s, ids).lockable) throw new Error('Someone is unavailable on that date — it cannot be locked in');
      p.status = 'agreed'; p.agreedSlotId = slotId; p.agreedAt = new Date().toISOString();
      p.agreements = ids.filter(function (id) { return s.votes[id] === 'available'; }).map(function (id) { return { playerId: id, via: 'vote', at: p.agreedAt }; });
      dLog(self, p, 'date_agreed', { date: s.date, window: s.window, start_time: s.startTime, votes: clone(s.votes) });
    });
  };
  function dAgree(store, d, pollId, playerId, via) {
    var p = dPoll(d, pollId); if (p.status !== 'agreed') throw new Error('There is no agreed date to confirm');
    if (p.agreements.some(function (a) { return a.playerId === playerId; })) return;
    p.agreements.push({ playerId: playerId, via: via, at: new Date().toISOString() });
    dLog(store, p, 'player_confirmed', { player: playerId, via: via });
  }
  DemoStore.prototype.confirmAttendance = function (pollId) { var self = this, me = this.demoPlayer(); return this._mutate(function (d) { dAgree(self, d, pollId, me, 'confirmation'); }); };
  DemoStore.prototype.adminConfirmAttendance = function (pollId, playerId) { var self = this; return this._mutate(function (d) { dAgree(self, d, pollId, playerId, 'admin'); }); };
  DemoStore.prototype.confirmTeeTime = function (pollId, b) {
    var self = this;
    return this._mutate(function (d) {
      var p = dPoll(d, pollId);
      if (p.status !== 'agreed' && p.status !== 'confirmed') throw new Error('Lock in a date before confirming the tee time');
      if (!String(b.course || '').trim()) throw new Error('Golf course is required');
      if (!T.validDate(b.teeDate) || !T.validTime(b.teeTime)) throw new Error('Tee-off date and time are required');
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (f.status === 'completed') throw new Error('That round has already been played');
      var was = p.status;
      if (was === 'agreed') {
        var missing = T.pendingAgreement(p, d.players.map(function (x) { return x.id; }));
        if (missing.length) throw new Error('Still awaiting confirmation from ' + missing.map(function (id) { return d.players.filter(function (x) { return x.id === id; })[0].name; }).join(', '));
      }
      var prev = { course: p.course, tee_date: p.teeDate, tee_time: p.teeTime };
      p.status = 'confirmed'; p.course = b.course.trim(); p.teeDate = b.teeDate; p.teeTime = b.teeTime.slice(0, 5); p.bookingRef = (b.bookingRef || '').trim(); p.bookingNotes = (b.notes || '').trim();
      p.durationMinutes = Number(b.durationMinutes) || T.DEFAULT_DURATION; p.confirmedAt = new Date().toISOString();
      f.date = p.teeDate; f.teeTime = p.teeTime; f.course = p.course;      // the existing fixture — never a second record
      dLog(self, p, was === 'confirmed' ? 'booking_amended' : 'tee_time_confirmed', { course: p.course, tee_date: p.teeDate, tee_time: p.teeTime, booking_ref: p.bookingRef, previous: was === 'confirmed' ? prev : null });
    });
  };
  DemoStore.prototype.reopenPoll = function (pollId) {
    var self = this;
    return this._mutate(function (d) {
      var p = dPoll(d, pollId); if (p.status !== 'agreed' && p.status !== 'confirmed') throw new Error('Only an agreed or confirmed round can be reopened');
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (f.status === 'completed') throw new Error('That round has already been played');
      var s = p.slots.filter(function (x) { return x.id === p.agreedSlotId; })[0];
      dLog(self, p, 'reopened', { from: p.status, course: p.course, tee_date: p.teeDate, tee_time: p.teeTime, booking_ref: p.bookingRef, agreed_date: s ? s.date : null, agreed_by: p.agreements.map(function (a) { return a.playerId; }) });
      if (p.status === 'confirmed') f.teeTime = null;
      p.status = 'polling'; p.agreedSlotId = null; p.agreedAt = null; p.agreements = []; p.teeDate = null; p.teeTime = null; p.bookingRef = ''; p.bookingNotes = ''; p.confirmedAt = null;
    });
  };
  DemoStore.prototype.cancelPoll = function (pollId) {
    var self = this;
    return this._mutate(function (d) {
      var p = dPoll(d, pollId); if (p.status === 'cancelled') return;
      var f = d.fixtures.filter(function (x) { return x.id === p.fixtureId; })[0];
      if (p.status === 'confirmed' && f.status !== 'completed') f.teeTime = null;
      dLog(self, p, 'cancelled', { from: p.status }); p.status = 'cancelled';
    });
  };

  /* ------------------------------------------------------------------
     SUPABASE STORE (production)
     Writes go through RLS-protected tables and SECURITY DEFINER RPCs
     that re-check is_admin() on the server.
     ------------------------------------------------------------------ */
  function SupabaseStore(cfg) {
    this.mode = 'live';
    this.sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  function check(res) { if (res.error) throw new Error(res.error.message || 'Database error'); return res.data; }
  function one(x) { return Array.isArray(x) ? x[0] : x; }

  SupabaseStore.prototype.load = async function () {
    var sb = this.sb;
    // Tee Sheet tables exist only after migrations/002_tee_sheet.sql — degrade gracefully without them.
    var sch = await Promise.all([
      sb.from('scheduling_polls').select('*').order('created_at'),
      sb.from('scheduling_slots').select('*'),
      sb.from('scheduling_votes').select('slot_id,player_id,status,updated_at'),
      sb.from('scheduling_agreements').select('poll_id,player_id,via,agreed_at'),
      sb.from('scheduling_events').select('poll_id,event_type,actor_player_id,event_data,created_at').order('created_at')
    ]);
    var teeReady = !sch.some(function (x) { return x.error; });
    var r = await Promise.all([
      sb.from('players').select('id,name,color,image_url,sort_order').order('sort_order'),
      sb.from('seasons').select('id,number,name,year,total_rounds,status').order('number'),
      sb.from('fixtures').select('id,season_id,round_number,scheduled_date,course,' + (teeReady ? 'tee_time,' : '') + 'fixture_teams(side,team_members(player_id)),results(score_a,score_b,played_on,notes,updated_at)').order('round_number'),
      sb.from('fine_categories').select('id,name,default_amount,active,sort_order').order('sort_order'),
      sb.from('fines').select('id,season_id,player_id,category_id,fixture_id,amount,notes,created_at,fine_categories(name),fine_payments(amount)').order('created_at')
    ]);
    var players = check(r[0]).map(function (p) {
      var base = PLAYERS.filter(function (x) { return x.id === p.id; })[0] || {};
      return { id: p.id, name: p.name, color: p.color || base.color || '#888', image: p.image_url || base.image || ('assets/' + p.id + '.png'), sort: p.sort_order };
    });
    var seasons = check(r[1]).map(function (s) { return { id: s.id, number: s.number, name: s.name, year: s.year, totalRounds: s.total_rounds, status: s.status }; });
    var fixtures = check(r[2]).map(function (f) {
      var teams = { a: [], b: [] };
      (f.fixture_teams || []).forEach(function (t) { teams[t.side] = (t.team_members || []).map(function (m) { return m.player_id; }).sort(function (x, y) { return players.findIndex(function (p) { return p.id === x; }) - players.findIndex(function (p) { return p.id === y; }); }); });
      var res = one(f.results);
      return {
        id: f.id, seasonId: f.season_id, round: f.round_number,
        date: (res && res.played_on) || f.scheduled_date || null, course: f.course || '', teeTime: f.tee_time ? String(f.tee_time).slice(0, 5) : null,
        teamA: teams.a, teamB: teams.b,
        status: res ? 'completed' : 'scheduled',
        scoreA: res ? res.score_a : null, scoreB: res ? res.score_b : null, notes: res ? (res.notes || '') : '', updatedAt: res ? res.updated_at : null
      };
    });
    var cats = check(r[3]).map(function (c) { return { id: c.id, name: c.name, amount: Number(c.default_amount), active: c.active, sort: c.sort_order }; });
    var fines = check(r[4]).map(function (f) {
      var paidAmt = (f.fine_payments || []).reduce(function (s, p) { return s + Number(p.amount); }, 0);
      return { id: f.id, seasonId: f.season_id, playerId: f.player_id, categoryId: f.category_id, categoryName: f.fine_categories ? one(f.fine_categories).name : 'Other', fixtureId: f.fixture_id, amount: Number(f.amount), paid: paidAmt >= Number(f.amount) - 0.001, notes: f.notes || '', createdAt: f.created_at };
    });
    var polls = [];
    if (teeReady) {
      var slots = sch[1].data || [], votes = sch[2].data || [], agr = sch[3].data || [], evs = sch[4].data || [];
      polls = (sch[0].data || []).map(function (p) {
        return {
          id: p.id, seasonId: p.season_id, fixtureId: p.fixture_id, status: p.status, timezone: p.timezone || T.DEFAULT_TZ,
          deadline: p.voting_deadline || null, closeAtDeadline: !!p.close_at_deadline, notes: p.notes || '',
          agreedSlotId: p.agreed_slot_id, agreedAt: p.agreed_at, teeDate: p.tee_date, teeTime: p.tee_time ? String(p.tee_time).slice(0, 5) : null,
          course: p.course || '', bookingRef: p.booking_ref || '', bookingNotes: p.booking_notes || '', durationMinutes: p.duration_minutes || T.DEFAULT_DURATION,
          confirmedAt: p.confirmed_at, createdAt: p.created_at,
          slots: slots.filter(function (s) { return s.poll_id === p.id; }).map(function (s) {
            var v = {}; votes.forEach(function (x) { if (x.slot_id === s.id) v[x.player_id] = x.status; });
            return { id: s.id, date: s.proposed_date, window: s.time_window, startTime: s.start_time ? String(s.start_time).slice(0, 5) : null, notes: s.notes || '', preferred: !!s.preferred, votes: v };
          }),
          agreements: agr.filter(function (a) { return a.poll_id === p.id; }).map(function (a) { return { playerId: a.player_id, via: a.via, at: a.agreed_at }; }),
          events: evs.filter(function (e) { return e.poll_id === p.id; }).map(function (e) { return { type: e.event_type, at: e.created_at, playerId: e.actor_player_id, data: e.event_data || {} }; })
        };
      });
    }
    return { players: players, seasons: seasons, fixtures: fixtures, fineCategories: cats, fines: fines, scheduling: { ready: teeReady }, polls: polls };
  };

  SupabaseStore.prototype.session = async function () {
    var s = check(await this.sb.auth.getSession());
    if (!s.session) return null;
    var admin = check(await this.sb.rpc('is_admin'));
    var playerId = null;
    try { var pr = await this.sb.rpc('current_player_id'); if (!pr.error) playerId = pr.data || null; } catch (e) { /* migration 002 not applied yet */ }
    return { email: s.session.user.email, admin: !!admin, playerId: playerId };
  };
  SupabaseStore.prototype.signIn = async function (email, password) {
    check(await this.sb.auth.signInWithPassword({ email: email, password: password }));
    return this.session();
  };
  SupabaseStore.prototype.signOut = async function () { await this.sb.auth.signOut(); };
  SupabaseStore.prototype.onChange = function (cb) {
    // Optional realtime refresh (enable Realtime on the tables in Supabase to use it)
    try {
      var ch = this.sb.channel('dd-changes');
      ['results', 'fixtures', 'fines', 'fine_payments', 'team_members', 'fine_categories', 'seasons', 'scheduling_polls', 'scheduling_slots', 'scheduling_votes', 'scheduling_agreements'].forEach(function (t) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, function () { cb(); });
      });
      ch.subscribe();
    } catch (e) { /* realtime is optional */ }
  };

  SupabaseStore.prototype.saveResult = async function (p) {
    return check(await this.sb.rpc('save_result', {
      p_fixture_id: p.fixtureId, p_played_on: p.date, p_course: p.course,
      p_score_a: p.scoreA, p_score_b: p.scoreB, p_notes: p.notes || null, p_mode: p.mode
    }));
  };
  SupabaseStore.prototype.deleteResult = async function (fixtureId) {
    return check(await this.sb.rpc('delete_result', { p_fixture_id: fixtureId }));
  };
  SupabaseStore.prototype.updateFixture = async function (p) {
    return check(await this.sb.from('fixtures').update({ scheduled_date: p.date || null, course: p.course || null }).eq('id', p.id).select('id'));
  };
  SupabaseStore.prototype.swapPairings = async function (a, b) {
    return check(await this.sb.rpc('swap_fixture_pairings', { p_fixture_a: a, p_fixture_b: b }));
  };
  SupabaseStore.prototype.addFines = async function (list) {
    if (!list.length) return;
    var rows = list.map(function (f) { return { season_id: f.seasonId, player_id: f.playerId, category_id: f.categoryId, fixture_id: f.fixtureId || null, amount: Number(f.amount), notes: f.notes || null }; });
    var ins = check(await this.sb.from('fines').insert(rows).select('id,amount'));
    var paid = [];
    list.forEach(function (f, i) { if (f.paid) paid.push({ fine_id: ins[i].id, amount: ins[i].amount }); });
    if (paid.length) check(await this.sb.from('fine_payments').insert(paid));
  };
  SupabaseStore.prototype.updateFine = async function (id, patch) {
    var row = {};
    if ('playerId' in patch) row.player_id = patch.playerId;
    if ('categoryId' in patch) row.category_id = patch.categoryId;
    if ('fixtureId' in patch) row.fixture_id = patch.fixtureId || null;
    if ('amount' in patch) row.amount = Number(patch.amount);
    if ('notes' in patch) row.notes = patch.notes || null;
    if (Object.keys(row).length) check(await this.sb.from('fines').update(row).eq('id', id).select('id'));
    if ('paid' in patch) {
      check(await this.sb.from('fine_payments').delete().eq('fine_id', id));
      if (patch.paid) {
        var f = one(check(await this.sb.from('fines').select('amount').eq('id', id)));
        check(await this.sb.from('fine_payments').insert({ fine_id: id, amount: f.amount }));
      }
    }
  };
  SupabaseStore.prototype.deleteFine = async function (id) { check(await this.sb.from('fines').delete().eq('id', id)); };
  SupabaseStore.prototype.saveCategory = async function (c) {
    if (c.id) check(await this.sb.from('fine_categories').update({ name: c.name, default_amount: Number(c.amount), active: c.active !== false }).eq('id', c.id).select('id'));
    else check(await this.sb.from('fine_categories').insert({ name: c.name, default_amount: Number(c.amount) }));
  };
  SupabaseStore.prototype.createSeason = async function (p) {
    return check(await this.sb.rpc('create_season', { p_name: p.name || null, p_year: p.year || null }));
  };
  SupabaseStore.prototype.setSeasonStatus = async function (id, status) {
    check(await this.sb.from('seasons').update({ status: status }).eq('id', id).select('id'));
  };


  /* ---- Tee Sheet (Supabase) — every write is a permission-checked database function ---- */
  SupabaseStore.prototype._rpc = async function (fn, args) { return check(await this.sb.rpc(fn, args)); };
  SupabaseStore.prototype.createPoll = function (p) {
    return this._rpc('create_poll', { p_fixture_id: p.fixtureId, p_deadline: p.deadline || null, p_notes: p.notes || null, p_timezone: p.timezone || T.DEFAULT_TZ, p_close_at_deadline: !!p.closeAtDeadline,
      p_slots: p.slots.map(function (s) { return { date: s.date, window: s.window, start_time: s.window === 'time' ? s.startTime : null, notes: s.notes || null }; }) });
  };
  SupabaseStore.prototype.addSlot = function (pollId, s) { return this._rpc('add_poll_slot', { p_poll_id: pollId, p_date: s.date, p_window: s.window, p_start_time: s.window === 'time' ? s.startTime : null, p_notes: s.notes || null }); };
  SupabaseStore.prototype.removeSlot = function (slotId) { return this._rpc('remove_poll_slot', { p_slot_id: slotId }); };
  SupabaseStore.prototype.setSlotPreferred = function (slotId, on) { return this._rpc('set_slot_preferred', { p_slot_id: slotId, p_preferred: !!on }); };
  SupabaseStore.prototype.updatePoll = function (pollId, patch) { return this._rpc('update_poll', { p_poll_id: pollId, p_deadline: patch.deadline || null, p_close_at_deadline: !!patch.closeAtDeadline, p_notes: patch.notes || null }); };
  SupabaseStore.prototype.castVote = function (slotId, status) { return this._rpc('cast_vote', { p_slot_id: slotId, p_status: status }); };
  SupabaseStore.prototype.adminSetVote = function (slotId, playerId, status) { return this._rpc('admin_set_vote', { p_slot_id: slotId, p_player_id: playerId, p_status: status }); };
  SupabaseStore.prototype.lockIn = function (pollId, slotId) { return this._rpc('lock_in_date', { p_poll_id: pollId, p_slot_id: slotId }); };
  SupabaseStore.prototype.confirmAttendance = function (pollId) { return this._rpc('confirm_attendance', { p_poll_id: pollId }); };
  SupabaseStore.prototype.adminConfirmAttendance = function (pollId, playerId) { return this._rpc('admin_confirm_attendance', { p_poll_id: pollId, p_player_id: playerId }); };
  SupabaseStore.prototype.confirmTeeTime = function (pollId, b) {
    return this._rpc('confirm_tee_time', { p_poll_id: pollId, p_course: b.course, p_tee_date: b.teeDate, p_tee_time: b.teeTime, p_booking_ref: b.bookingRef || null, p_notes: b.notes || null, p_duration_minutes: Number(b.durationMinutes) || T.DEFAULT_DURATION });
  };
  SupabaseStore.prototype.reopenPoll = function (pollId) { return this._rpc('reopen_poll', { p_poll_id: pollId }); };
  SupabaseStore.prototype.cancelPoll = function (pollId) { return this._rpc('cancel_poll', { p_poll_id: pollId }); };

  root.DDData = {
    PLAYERS: PLAYERS, DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    buildDemo: buildDemo, DemoStore: DemoStore, SupabaseStore: SupabaseStore
  };
})(typeof self !== 'undefined' ? self : this);
