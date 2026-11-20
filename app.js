/* =====================================================================
   DESIGNATED DRIVERS — Application (UI, routing, forms)
   Depends on: engine.js (DDEngine), data.js (DDData), Chart.js, supabase-js
   ===================================================================== */
(function () {
  'use strict';
  var E = window.DDEngine, D = window.DDData, T = window.DDTee;
  var cfg = window.DD_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var liveConfigured = !!(cfg.supabaseUrl && cfg.supabasePublishableKey);
  var forceDemo = params.has('demo') || cfg.mode === 'demo';
  var MODE = (!forceDemo && liveConfigured) ? 'live' : 'demo';

  var state = { data: null, store: null, seasonId: null, route: null, raceChart: null, charts: [], prevSeries: null, fixtureFilter: 'all' };
  var app = document.getElementById('app');

  /* ------------------------------------------------------------------ helpers */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function money(n) { n = Number(n) || 0; return '$' + (Number.isInteger(n) ? n : n.toFixed(2)); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parseDate(iso) { if (!iso) return null; var p = String(iso).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(iso, withYear) { var d = parseDate(iso); if (!d || isNaN(d)) return 'Date TBC'; return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : ''); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function pct(v) { return v == null ? '—' : Math.round(v) + '%'; }
  function num1(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function pts(n) { return n + (n === 1 ? ' pt' : ' pts'); }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : (p || s + 's')); }
  function listNames(names) { return names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]; }

  var ICON = {
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z" fill="currentColor" stroke="none"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6z" fill="currentColor" stroke="currentColor"/></svg>',
    coins: '<svg viewBox="0 0 24 24"><ellipse cx="10" cy="6" rx="6" ry="2.5"/><path d="M4 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M4 10v4c0 1.4 2.7 2.5 6 2.5M4 14v4c0 1.4 2.7 2.5 6 2.5"/><ellipse cx="16" cy="14" rx="5" ry="2.2"/><path d="M11 14v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4"/></svg>',
    gavel: '<svg viewBox="0 0 24 24"><path d="m14.5 4.5 5 5M12 7l5 5M13.25 5.75l-4 4 5 5 4-4zM10.5 13.5 4 20"/><path d="M3 21h8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
    golf: '<svg viewBox="0 0 24 24"><path d="M9 21V3l8 4-8 4"/><path d="M5 21h10"/></svg>',
    balance: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 3.9-6 8-6s7.3 2 8 6"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 10 10"><path d="M5 1 9.5 8.5h-9z"/></svg>',
    down: '<svg viewBox="0 0 10 10"><path d="M5 9 .5 1.5h9z"/></svg>'
  };

  /* ------------------------------------------------------------------ data helpers */
  function players() { return state.data.players.slice().sort(function (a, b) { return a.sort - b.sort; }); }
  function ids() { return players().map(function (p) { return p.id; }); }
  function P(id) { return state.data.players.filter(function (p) { return p.id === id; })[0] || { id: id, name: id, color: '#999', image: '' }; }
  function nm(id) { return P(id).name; }
  function teamName(t) { return t.map(nm).join(' & '); }
  function season() { return state.data.seasons.filter(function (s) { return s.id === state.seasonId; })[0]; }
  function seasonFixtures(sid) { return state.data.fixtures.filter(function (f) { return f.seasonId === (sid || state.seasonId); }).sort(function (a, b) { return a.round - b.round; }); }
  function seasonFines(sid) { return state.data.fines.filter(function (f) { return f.seasonId === (sid || state.seasonId); }); }
  function fixtureById(id) { return state.data.fixtures.filter(function (f) { return f.id === id; })[0]; }
  function catById(id) { return state.data.fineCategories.filter(function (c) { return c.id === id; })[0]; }

  function avatar(id, cls, style) {
    var p = P(id);
    return '<span class="avatar ' + (cls || '') + '" style="--pc:' + p.color + ';' + (style || '') + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=\'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E4E4E2"/><circle cx="50" cy="34" r="17" fill="#A8A8A6"/><ellipse cx="50" cy="90" rx="34" ry="30" fill="#A8A8A6"/></svg>') + '\'"></span>';
  }
  function pair(t, cls) { return '<span class="avatar-pair">' + t.map(function (id) { return avatar(id, cls); }).join('') + '</span>'; }

  /** Everything the season pages need, derived fresh from the raw data. */
  function ctx() {
    var s = season(), fx = seasonFixtures(), order = ids();
    var table = E.standings(order, fx, order);
    var done = fx.filter(E.isCompleted);
    var next = fx.filter(function (f) { return !E.isCompleted(f); })[0] || null;
    var fines = seasonFines();
    return {
      season: s, fixtures: fx, ids: order, table: table, done: done, next: next,
      movement: E.movement(order, fx, order), timeline: E.timeline(order, fx),
      latest: E.latestFixture(fx), fines: fines, finesSum: E.finesSummary(order, fines),
      row: function (id) { return table.filter(function (r) { return r.id === id; })[0]; }
    };
  }
  function seasonLabel(s) { return s ? (s.name || ('Season ' + pad2(s.number))) : 'Season'; }

  /* ------------------------------------------------------------------ toasts */
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = (type === 'error' ? ICON.alert : ICON.check) + '<div>' + esc(msg) + '</div>';
    $('#toasts').appendChild(el);
    setTimeout(function () { el.classList.add('leaving'); setTimeout(function () { el.remove(); }, 320); }, type === 'error' ? 6000 : 3600);
  }

  /* ------------------------------------------------------------------ modal */
  var modalStack = null;
  function openModal(opts) {
    closeModal();
    var root = $('#modalRoot');
    root.hidden = false;
    root.innerHTML = '<div class="modal-backdrop" data-close></div><div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle"></div>';
    var m = $('.modal', root);
    var lastFocus = document.activeElement;
    function draw(o) {
      m.innerHTML = '<div class="modal-head"><div><h2 id="modalTitle">' + o.title + '</h2>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '</div><button type="button" class="icon-btn" data-close aria-label="Close">' + ICON.close + '</button></div>' +
        '<div class="modal-body">' + o.body + '</div>' + (o.foot ? '<div class="modal-foot">' + o.foot + '</div>' : '');
      if (o.mount) o.mount(m);
      var f = $('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea', $('.modal-body', m));
      if (f && window.innerWidth > 700) f.focus(); else m.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    m.tabIndex = -1;
    modalStack = { el: m, close: function () { document.removeEventListener('keydown', onKey); root.hidden = true; root.innerHTML = ''; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }, draw: draw };
    draw(opts);
    return modalStack;
  }
  document.getElementById('modalRoot').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });
  function closeModal() { if (modalStack) { var m = modalStack; modalStack = null; m.close(); } }

  function confirmDialog(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false, obs;
      openModal({
        title: title, body: '<p style="margin:0">' + message + '</p>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cfOk">' + okLabel + '</button>',
        mount: function (m) { $('#cfOk', m).onclick = function () { done = true; obs.disconnect(); closeModal(); resolve(true); }; }
      });
      obs = new MutationObserver(function () { if ($('#modalRoot').hidden && !done) { obs.disconnect(); resolve(false); } });
      obs.observe($('#modalRoot'), { attributes: true });
    });
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + (label || 'Saving…'); }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  /* ------------------------------------------------------------------ editing (no logins) */
  // Anyone with the link can record and correct results and fines. Every write
  // goes through a validated, rate-limited database function (see supabase-schema.sql).
  // `edit` is the single choke point should a read-only mode ever be wanted.
  function edit(fn) { return fn(); }
  function renderFooter() {
    var el = $('#footerAuth');
    el.innerHTML = MODE === 'demo' ? 'Demo mode · <button type="button" data-action="reset-demo">Reset demo data</button>' : 'Shared scoreboard · changes save for everyone';
  }
  /** Hidden field real people never fill in; simple bots do. */
  var HONEYPOT = '<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">';
  function trapped(m) { var h = $('.hp', m); return !!(h && h.value); }

  /* ------------------------------------------------------------------ hero */
  function seasonEyebrow() {
    var ss = state.data.seasons;
    if (ss.length < 2) return '<p class="hero-eyebrow">' + esc(seasonLabel(season())) + '</p>';
    return '<p class="hero-eyebrow"><label class="visually-hidden" for="seasonSel">Season</label><select class="season-select" id="seasonSel" data-action="season">' +
      ss.slice().sort(function (a, b) { return b.number - a.number; }).map(function (s) { return '<option value="' + s.id + '"' + (s.id === state.seasonId ? ' selected' : '') + '>' + esc(seasonLabel(s)) + (s.status === 'completed' ? ' (complete)' : '') + '</option>'; }).join('') + '</select></p>';
  }
  function hero(title, lede, meta) {
    return '<section class="hero"><div>' + seasonEyebrow() + '<h1>' + title + '</h1>' + (lede ? '<p class="hero-lede">' + lede + '</p>' : '') + '</div>' + (meta || '') + '</section>';
  }
  function roundMeta(c) {
    var total = c.season.totalRounds || 12, n = c.next, prop = n ? liveProposal(n.id) : null, nextHtml, link = '';
    if (!n) nextHtml = '<div class="meta-next">' + ICON.trophy + '<span>Season complete</span></div>';
    else {
      var when;
      if (n.date) when = fmtDate(n.date) + (n.teeTime ? ' · ' + time12(n.teeTime) : '') + (n.course ? ' · ' + esc(n.course) : ' · Course TBC');
      else if (prop) when = (T.proposalState(fixturePlayers(n), prop.responses).allIn ? 'Agreed · ' : 'Proposed · ') + T.shortDate(prop.date) + ' · ' + slotLabel(prop.slot);
      else when = 'Round ' + pad2(n.round) + ' · Date TBC';
      nextHtml = '<div class="meta-next">' + ICON.calendar + '<span>' + when + '</span></div>';
      var locked = lockOf(n);
      if (!(locked && locked.kind !== 'agreed') && !(state.route && state.route.page === 'tee-time')) link = '<a class="meta-link" href="#/tee-time">' + (locked ? 'Set the tee time' : prop ? 'Confirm on Tee Time' : 'Find a date') + ' →</a>';
    }
    return '<div class="hero-meta"><div class="meta-block center"><span class="meta-label">Round</span><span class="meta-big">' + pad2(c.done.length) + ' / ' + total + '</span></div>' +
      '<div class="meta-block"><span class="meta-label">' + (n ? 'Next Round' : 'Status') + '</span>' + nextHtml + link + '</div></div>';
  }

  /* ------------------------------------------------------------------ CLUBHOUSE */
  function renderClubhouse() {
    var c = ctx();
    var html = '<div class="page container">' + hero('The Clubhouse', '', roundMeta(c)) +
      '<div class="grid grid-race">' + raceCard(c) + standingsCard(c) + '</div>' +
      '<div class="grid grid-latest">' + latestCard(c) + keyStatsCard(c) + '</div></div>';
    app.innerHTML = html;
    mountRace(c);
  }

  function raceCard(c) {
    return '<section class="card race-card" aria-labelledby="raceTitle"><div class="card-head"><div><h2 id="raceTitle">Championship Race</h2><p class="card-sub">Cumulative points across ' + esc(seasonLabel(c.season)) + '</p></div></div>' +
      '<div class="race-wrap" id="raceWrap"><canvas id="raceCanvas" role="img" aria-label="Line chart of cumulative championship points by round"></canvas><div class="race-markers" id="raceMarkers"></div>' +
      (c.done.length ? '' : '<div class="race-empty-note">The race begins once Round 01 is recorded.</div>') + '</div>' +
      '<p class="visually-hidden">' + c.table.map(function (r) { return nm(r.id) + ' ' + plural(r.points, 'point'); }).join(', ') + '</p></section>';
  }

  function standingsCard(c) {
    var rows = c.table.map(function (r, i) {
      var mv = c.movement[r.id] || 0;
      var mvHtml = mv > 0 ? '<span class="move up" title="Up ' + mv + '">' + ICON.up + mv + '</span>' : mv < 0 ? '<span class="move down" title="Down ' + (-mv) + '">' + ICON.down + (-mv) + '</span>' : '<span class="move same" aria-label="No change">–</span>';
      var leader = r.rank === 1 && r.points > 0;
      return '<tr class="' + (leader ? 'leader' : '') + '" data-href="#/players/' + r.id + '" tabindex="0" aria-label="' + esc(nm(r.id)) + ', ' + plural(r.points, 'point') + ' — open profile">' +
        '<td class="rank-cell"><span class="rank-num">' + r.rank + (r.shared ? '=' : '') + '</span>' + mvHtml + '</td>' +
        '<td><div class="player-cell">' + avatar(r.id, 'ring-light', '--size:40px') + '<span class="name">' + esc(nm(r.id)) + '</span></div></td>' +
        '<td>' + r.played + '</td><td>' + r.wins + '</td><td>' + r.draws + '</td><td>' + r.losses + '</td>' +
        '<td><span class="pts-box">' + r.points + '</span></td></tr>';
    }).join('');
    return '<section class="card" aria-labelledby="standTitle"><h2 id="standTitle">Championship Standings</h2>' +
      '<table class="standings"><thead><tr><th class="l" scope="col" style="padding-left:10px">#</th><th class="l" scope="col">Player</th><th scope="col" title="Played">P</th><th scope="col" title="Won">W</th><th scope="col" title="Drawn">D</th><th scope="col" title="Lost">L</th><th scope="col" title="Championship points">PTS</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="standings-note">Win 2 · Draw 1 · Loss 0. Ties split on wins, then stroke differential.</p></section>';
  }

  function latestCard(c) {
    var f = c.latest;
    var head = '<div class="card-head"><h2>Latest Round</h2><a class="link-arrow" href="#/fixtures">View All Results ' + ICON.arrow + '</a></div>';
    if (!f) {
      return '<section class="card">' + head + '<div class="empty"><div class="empty-icon">' + ICON.golf + '</div><h4>The first tee awaits</h4><p>No rounds have been recorded yet. Once Round 01 is in the books, the result will appear here.</p>' +
        '<button class="btn btn-primary" data-action="submit-result">' + ICON.plus + 'Submit the first result</button></div></section>';
    }
    var o = E.outcome(f);
    var banner = o.winner === 'DRAW'
      ? '<div class="win-banner draw"><span class="trophy">' + ICON.balance + '</span><div><div class="t1">All square</div><div class="t2">Tied on ' + f.scoreA + ' · +1 pt each</div></div></div>'
      : '<div class="win-banner"><span class="trophy">' + ICON.trophy + '</span><div><div class="t1">' + esc(teamName(o.winners)) + ' win</div><div class="t2">By ' + plural(o.margin, 'stroke') + ' · +2 pts each</div></div></div>';
    return '<section class="card latest-card">' + head +
      '<p class="round-line"><strong>Round ' + pad2(f.round) + '</strong> · ' + fmtDate(f.date) + (f.course ? ' · ' + esc(f.course) : '') + '</p>' +
      '<div class="matchup" role="button" tabindex="0" data-fixture="' + f.id + '" style="cursor:pointer" aria-label="Open Round ' + f.round + ' details">' +
      '<div class="team' + (o.winner === 'B' ? ' lost' : '') + '">' + pair(f.teamA, 'ring-light') + '<span class="team-name">' + esc(teamName(f.teamA)) + '</span></div>' +
      '<div class="score-pill">' + f.scoreA + ' – ' + f.scoreB + '</div>' +
      '<div class="team' + (o.winner === 'A' ? ' lost' : '') + '">' + pair(f.teamB, 'ring-light') + '<span class="team-name">' + esc(teamName(f.teamB)) + '</span></div></div>' +
      banner + '</section>';
  }

  function statCard(icon, label, value, sub, href, small) {
    return '<a class="stat" href="' + href + '"><span class="stat-icon">' + icon + '</span><span class="stat-body"><span class="stat-label">' + label + '</span><div class="stat-value' + (small ? ' sm' : '') + '">' + value + '</div><div class="stat-sub">' + sub + '</div></span></a>';
  }
  function keyStatsCard(c) {
    var leaders = c.table.filter(function (r) { return r.rank === 1 && r.points > 0; });
    var wins = E.leaders(c.table, function (r) { return r.wins; });
    var fs = c.finesSum;
    var off = fs.topOffenders;
    var leaderVal = leaders.length ? esc(listNames(leaders.map(function (r) { return nm(r.id); }))) : '—';
    var leaderSub = leaders.length ? pts(leaders[0].points) + (leaders.length > 1 ? ' · shared' : '') : 'No rounds yet';
    var winVal = wins.length ? esc(listNames(wins.map(function (r) { return nm(r.id); }))) : '—';
    var winSub = wins.length ? plural(wins[0].wins, 'win') + (wins.length > 1 ? ' · shared' : '') : 'No wins yet';
    var offVal = off.length ? esc(listNames(off.map(function (r) { return nm(r.id); }))) : '—';
    var offSub = off.length ? money(off[0].total) + ' in fines' + (off.length > 1 ? ' · shared' : '') : 'A clean card, so far';
    return '<section class="card"><h2>Key Stats</h2><div class="stat-grid">' +
      statCard(ICON.trophy, 'Championship Leader', leaderVal, leaderSub, leaders.length === 1 ? '#/players/' + leaders[0].id : '#/players', leaders.length > 1) +
      statCard('<span style="color:var(--cream)">' + ICON.flag + '</span>', 'Most Wins', winVal, winSub, wins.length === 1 ? '#/players/' + wins[0].id : '#/players', wins.length > 1) +
      statCard('<span style="color:var(--cream)">' + ICON.coins + '</span>', 'Fines Pot', money(fs.total), plural(fs.count, 'offence'), '#/fines') +
      statCard('<span style="color:var(--cream)">' + ICON.gavel + '</span>', 'Biggest Offender', offVal, offSub, '#/fines', off.length > 1) +
      '</div></section>';
  }

  /* ------------------------------------------------------------------ Championship Race chart */
  function destroyCharts() {
    state.charts.forEach(function (ch) { try { ch.destroy(); } catch (e) {} });
    state.charts = []; state.raceChart = null;
  }
  function chartAvailable() { return typeof window.Chart === 'function'; }

  function mountRace(c) {
    var canvas = $('#raceCanvas');
    if (!canvas) return;
    if (!chartAvailable()) { $('#raceWrap').innerHTML = '<div class="empty"><p>The chart library could not load. Check your connection and refresh.</p></div>'; return; }
    var total = c.season.totalRounds || 12;
    var labels = []; for (var i = 0; i <= total; i++) labels.push('R' + i);
    var tl = c.timeline;
    var prev = state.prevSeries && state.prevSeries.seasonId === c.season.id ? state.prevSeries.series : null;
    var order = players();
    function ds(series) {
      return order.map(function (p) {
        return {
          label: p.name, data: series[p.id].slice(), borderColor: p.color, backgroundColor: p.color,
          borderWidth: 2.5, pointRadius: 4.5, pointHoverRadius: 6.5, pointBackgroundColor: p.color, pointBorderColor: p.color, tension: 0, clip: false
        };
      });
    }
    var mobile = $('#raceWrap').clientWidth < 520;
    var chart = new window.Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: ds(prev && prev[order[0].id].length <= tl.series[order[0].id].length ? prev : tl.series) },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 16, right: mobile ? 20 : 26, left: 0, bottom: 0 } },
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 900, easing: 'easeOutCubic', onComplete: function () { positionMarkers(chart, c); } },
        onResize: function () { setTimeout(function () { positionMarkers(chart, c); }, 30); },
        scales: {
          x: { grid: { display: false }, border: { color: '#9AA09A', width: 1.2 }, ticks: { color: '#2b2f2c', font: { family: 'Inter', size: mobile ? 10 : 13 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 4 } },
          y: { min: 0, max: 24, ticks: { stepSize: 4, color: '#2b2f2c', font: { family: 'Inter', size: mobile ? 10 : 13 }, padding: 8 }, border: { color: '#9AA09A', width: 1.2 }, grid: { color: 'rgba(60,60,50,.13)', tickLength: 0 }, }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#062E20', titleColor: '#F7F5EE', bodyColor: '#F7F5EE', borderColor: 'rgba(216,175,85,.6)', borderWidth: 1,
            padding: 10, cornerRadius: 10, boxPadding: 4, usePointStyle: true,
            titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
            itemSort: function (a, b) { return b.parsed.y - a.parsed.y; },
            callbacks: {
              title: function (items) { var r = items[0].dataIndex; if (r === 0) return 'Season start'; var f = c.fixtures.filter(function (x) { return x.round === r; })[0]; return 'After Round ' + pad2(r) + (f && E.isCompleted(f) ? '' : ' (not yet played)'); },
              label: function (it) { return ' ' + it.dataset.label + ': ' + pts(it.parsed.y); }
            }
          }
        }
      }
    });
    state.raceChart = chart; state.charts.push(chart);
    // markers (avatars at line ends)
    var mk = $('#raceMarkers');
    mk.innerHTML = '<svg aria-hidden="true"></svg>' + order.map(function (p) {
      return '<a class="marker-avatar" data-m="' + p.id + '" href="#/players/' + p.id + '" aria-label="' + esc(p.name) + '">' + avatar(p.id, '', 'width:100%;height:100%') + '</a>' +
        '<span class="marker-label" data-l="' + p.id + '" style="background:' + p.color + ';color:' + labelInk(p.color) + '"></span>';
    }).join('');
    positionMarkers(chart, c, true);
    if (prev) {
      // animate the extension from the previous state to the new one
      requestAnimationFrame(function () {
        if (state.raceChart !== chart) return;   // the page re-rendered before this frame
        chart.data.datasets.forEach(function (d, i) { d.data = tl.series[order[i].id].slice(); });
        chart.update();
        positionMarkers(chart, c);
      });
    }
    state.prevSeries = { seasonId: c.season.id, series: tl.series };
  }
  function labelInk(hex) {
    var h = hex.replace('#', ''); var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1C221F' : '#FFFFFF';
  }

  /**
   * Places each avatar exactly on its line's endpoint, then lays labels out
   * without overlap. Players on the same (or nearly the same) value are fanned
   * out horizontally and joined to their true point by a thin line, so nobody's
   * score is misrepresented.
   */
  function positionMarkers(chart, c, instant) {
    var wrap = $('#raceWrap'); if (!wrap || !chart.scales || !chart.scales.x) return;
    var W = wrap.clientWidth, H = wrap.clientHeight;
    var mobile = W < 520;
    var A = mobile ? 28 : 38, LH = mobile ? 22 : 26, GAP = 4;
    var xs = chart.scales.x, ysc = chart.scales.y, area = chart.chartArea;
    var tl = c.timeline, last = tl.lastRound;
    var items = c.table.map(function (r) {
      var v = tl.series[r.id][last];
      return { id: r.id, pts: v, px: xs.getPixelForValue(last), py: ysc.getPixelForValue(v) };
    });
    var flip = items[0].px > area.left + area.width * 0.58;
    var dir = flip ? -1 : 1;
    // cluster points that are too close vertically for avatars to sit side by side
    items.sort(function (a, b) { return a.py - b.py || c.ids.indexOf(a.id) - c.ids.indexOf(b.id); });
    var clusters = [];
    items.forEach(function (it) {
      var cl = clusters[clusters.length - 1];
      if (cl && it.py - cl[cl.length - 1].py < A * 0.45) cl.push(it); else clusters.push([it]);
    });
    var STEP = A * 0.8;
    clusters.forEach(function (cl) {
      cl.forEach(function (it, k) {
        it.ax = it.px + dir * k * STEP;
        it.ay = it.py;
        it.k = k; it.n = cl.length;
      });
    });
    var maxFan = Math.max.apply(null, clusters.map(function (cl) { return cl.length - 1; })) * STEP;
    // label text + width measurement
    items.forEach(function (it) {
      var el = $('[data-l="' + it.id + '"]', wrap);
      el.innerHTML = esc(nm(it.id)) + '<span class="sep">' + (mobile ? '·' : '–') + '</span>' + it.pts + ' ' + (it.pts === 1 ? 'PT' : 'PTS');
      it.lw = el.offsetWidth;
      it.desired = it.py;
    });
    // vertical de-overlap of labels (keep order of true values)
    var minY = LH / 2 + 2, maxY = H - LH / 2 - 2;
    var lab = items.slice().sort(function (a, b) { return a.desired - b.desired || c.ids.indexOf(a.id) - c.ids.indexOf(b.id); });
    lab.forEach(function (it, i) { it.ly = Math.max(it.desired, minY, i ? lab[i - 1].ly + LH + GAP : minY); });
    for (var i = lab.length - 1; i >= 0; i--) { var lim = i === lab.length - 1 ? maxY : lab[i + 1].ly - LH - GAP; if (lab[i].ly > lim) lab[i].ly = lim; }
    // either every label sits attached to its avatar, or (when anything had to move) all sit in a tidy column
    var displaced = maxFan > 0 || lab.some(function (it) { return Math.abs(it.ly - it.desired) > 1.5; });
    items.forEach(function (it) { it.labelAnchor = displaced ? items[0].px + dir * (maxFan + A / 2 + 14) : it.px + dir * (A / 2 - 6); });
    // apply
    var svg = $('svg', $('#raceMarkers'));
    var lines = '';
    items.forEach(function (it) {
      var av = $('[data-m="' + it.id + '"]', wrap), el = $('[data-l="' + it.id + '"]', wrap);
      var attached = !displaced;
      var lx = it.labelAnchor;
      var left = flip ? lx - it.lw : lx;
      left = Math.max(0, Math.min(W - it.lw, left));
      el.className = 'marker-label' + (attached ? (flip ? ' flip' : '') : ' free');
      av.style.width = av.style.height = A + 'px';
      av.style.zIndex = String(10 - c.table.findIndex(function (r) { return r.id === it.id; }));
      if (instant) { av.style.transition = el.style.transition = 'none'; }
      av.style.transform = 'translate(' + (it.ax - A / 2) + 'px,' + (it.ay - A / 2) + 'px)';
      el.style.transform = 'translate(' + left + 'px,' + (it.ly - LH / 2) + 'px)';
      if (instant) { void av.offsetWidth; av.style.transition = el.style.transition = ''; }
      var col = P(it.id).color;
      if (it.k > 0) lines += '<line x1="' + it.px + '" y1="' + it.py + '" x2="' + it.ax + '" y2="' + it.ay + '" stroke="' + col + '" stroke-width="2" stroke-dasharray="2 3"/>';
      if (!attached) lines += '<path d="M' + (it.ax + dir * A / 2) + ' ' + it.ay + ' L' + (lx - dir * 2) + ' ' + it.ly + '" stroke="' + col + '" stroke-width="1.5" fill="none" opacity=".9"/>';
    });
    svg.innerHTML = lines;
  }

  /* ------------------------------------------------------------------ FIXTURES */
  function renderFixtures() {
    var c = ctx();
    var bal = E.validateSeasonBalance(c.fixtures);
    var f = state.fixtureFilter;
    var list = c.fixtures.filter(function (x) { return f === 'all' || (f === 'done' ? E.isCompleted(x) : !E.isCompleted(x)); });
    var items = list.map(function (x) { return fixtureRow(x, c); }).join('');
    app.innerHTML = '<div class="page container">' + hero('Fixtures', 'Twelve rounds of two-person Ambrose. Every partnership plays together four times — lowest gross wins.', roundMeta(c)) +
      '<div class="toolbar"><div class="chips" role="tablist">' +
      [['all', 'All rounds'], ['done', 'Results'], ['todo', 'Upcoming']].map(function (o) { return '<button class="chip' + (f === o[0] ? ' active' : '') + '" data-filter="' + o[0] + '" role="tab" aria-selected="' + (f === o[0]) + '">' + o[1] + '</button>'; }).join('') +
      '</div><span class="balance-note">' + ICON.balance + (bal.ok ? 'Partnerships balanced · each pairing ×' + bal.expected : 'Warning: partnership schedule is unbalanced') + '</span></div>' +
      '<div class="fixture-list">' + (items || '<div class="card empty"><h4>Nothing here yet</h4><p>No rounds match this filter.</p></div>') + '</div></div>';
  }
  function fixtureRow(f, c) {
    var done = E.isCompleted(f), o = done ? E.outcome(f) : null;
    var isNext = c.next && c.next.id === f.id;
    var prop = done ? null : liveProposal(f.id);
    var status = done ? '<span class="badge done">' + (o.winner === 'DRAW' ? 'Halved' : 'Final') + '</span>'
      : prop && prop.status === 'scheduled' ? '<span class="badge done">Scheduled</span>'
      : prop ? '<span class="badge next">' + (T.proposalState(fixturePlayers(f), prop.responses).allIn ? 'Date agreed' : 'Proposed') + '</span>'
      : isNext ? '<span class="badge next">Up next</span>' : '<span class="badge">Upcoming</span>';
    var dateText = !done && !f.date && prop ? T.shortDate(prop.date) + ' · ' + slotLabel(prop.slot) + ' (proposed)' : fmtDate(f.date) + (!done && f.teeTime ? ' · ' + time12(f.teeTime) : '');
    var center = done ? '<div class="score-pill">' + f.scoreA + ' – ' + f.scoreB + '</div>' : '<div class="score-pill">vs</div>';
    var result = done ? (o.winner === 'DRAW' ? 'All square' : esc(teamName(o.winners)) + ' by ' + o.margin) : '';
    return '<button type="button" class="fixture ' + (done ? 'completed' : 'upcoming') + (isNext ? ' next' : '') + '" data-fixture="' + f.id + '" aria-label="Round ' + f.round + ' details">' +
      '<div class="fx-round"><span class="lbl">Round</span><span class="r">' + pad2(f.round) + '</span></div>' +
      '<div class="fx-team' + (o && o.winner === 'A' ? ' won' : '') + '">' + pair(f.teamA, 'sm') + '<span class="nm">' + esc(teamName(f.teamA)) + '</span></div>' +
      '<div class="fx-center">' + center + '</div>' +
      '<div class="fx-team right' + (o && o.winner === 'B' ? ' won' : '') + '"><span class="nm">' + esc(teamName(f.teamB)) + '</span>' + pair(f.teamB, 'sm') + '</div>' +
      '<div class="fx-meta"><div class="date">' + dateText + '</div><div class="course">' + esc(f.course || 'Course TBC') + '</div>' + (result ? '<div class="small muted">' + result + '</div>' : '') + status + '</div></button>';
  }

  function c_isNext(f) { var n = ctx().next; return !!n && n.id === f.id; }
  function openFixture(id) {
    var f = fixtureById(id); if (!f) return;
    var done = E.isCompleted(f), o = done ? E.outcome(f) : null;
    var fines = state.data.fines.filter(function (x) { return x.fixtureId === f.id; });
    function team(t, side) {
      var won = o && o.winner === side;
      return '<div class="team">' + pair(t, 'lg') + '<span class="team-name">' + esc(teamName(t)) + '</span>' +
        (o ? '<span class="pts ' + (o.points[t[0]] ? 'plus' : '') + '">+' + pts(o.points[t[0]]) + ' each</span>' : '') + (won ? '<span class="badge done">Winners</span>' : '') + '</div>';
    }
    var body = '<div class="fixture-detail-teams">' + team(f.teamA, 'A') + (done ? '<div class="score-pill">' + f.scoreA + ' – ' + f.scoreB + '</div>' : '<div class="score-pill" style="background:transparent;color:var(--muted);border:1.5px dashed var(--line-2)">vs</div>') + team(f.teamB, 'B') + '</div>' +
      (done ? (o.winner === 'DRAW' ? '<div class="win-banner draw"><span class="trophy">' + ICON.balance + '</span><div><div class="t1">All square</div><div class="t2">Both teams on ' + f.scoreA + ' gross · +1 pt each</div></div></div>' : '<div class="win-banner"><span class="trophy">' + ICON.trophy + '</span><div><div class="t1">' + esc(teamName(o.winners)) + ' win</div><div class="t2">By ' + plural(o.margin, 'stroke') + ' · +2 pts each</div></div></div>') : '<div class="callout info">This round has not been played yet.</div>') +
      '<ul class="confirm-list" style="margin-top:14px"><li><span>Date</span><span>' + fmtDate(f.date, true) + '</span></li>' + (!done && f.teeTime ? '<li><span>Tee-off</span><span>' + time12(f.teeTime) + '</span></li>' : '') +
      (!done && (c_isNext(f) || (teeCtx().fixture || {}).id === f.id) ? '<li><span>Tee Time</span><span><a href="#/tee-time">' + (liveProposal(f.id) ? (liveProposal(f.id).status === 'scheduled' ? 'Scheduled' : 'Proposed') + ' — view' : 'Find a date') + ' →</a></span></li>' : '') + '<li><span>Course</span><span>' + esc(f.course || 'TBC') + '</span></li><li><span>Format</span><span>2-person Ambrose · gross</span></li>' +
      (f.notes ? '<li><span>Notes</span><span>' + esc(f.notes) + '</span></li>' : '') + '</ul>' +
      (fines.length ? '<div class="section-label">Fines this round</div><ul class="confirm-list">' + fines.map(function (x) { return '<li><span>' + esc(nm(x.playerId)) + ' — ' + esc(x.categoryName) + '</span><span>' + money(x.amount) + '</span></li>'; }).join('') + '</ul>' : '');
    var foot = (done ? '<button class="btn btn-danger btn-sm spacer" id="fxDel">' + ICON.trash + 'Delete result</button>' : '<button class="btn btn-ghost btn-sm spacer" id="fxSwap">' + ICON.swap + 'Swap pairing</button>' +
      '<button class="btn btn-ghost" id="fxEdit">' + ICON.calendar + 'Date & course</button>') + '<button class="btn btn-primary" id="fxRes">' + (done ? ICON.edit + 'Edit result' : ICON.plus + 'Enter result') + '</button>';
    openModal({
      title: 'Round ' + pad2(f.round), sub: esc(seasonLabel(season())) + ' · ' + (done ? 'Completed' : 'Scheduled'), body: body, foot: foot,
      mount: function (m) {
        var b;
        if ((b = $('#fxRes', m))) b.onclick = function () { openSubmit(f.id); };
        if ((b = $('#fxEdit', m))) b.onclick = function () { openFixtureEdit(f.id); };
        if ((b = $('#fxSwap', m))) b.onclick = function () { openSwap(f.id); };
        if ((b = $('#fxDel', m))) b.onclick = async function () {
          var ok = await confirmDialog('Delete Round ' + pad2(f.round) + ' result?', 'The score is removed and the standings and Championship Race are recalculated. Fines from that round are kept.', 'Delete result', true);
          if (!ok) return;
          try { await state.store.deleteResult(f.id); toast('Round ' + pad2(f.round) + ' result deleted. Standings recalculated.'); await refresh(); } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  }

  function openFixtureEdit(id) {
    edit(function () {
      var f = fixtureById(id), L = lockOf(f);
      if (L && L.proposal) { goThen('#/tee-time'); toast('Round ' + pad2(f.round) + '’s date was agreed on Tee Time — change or cancel it there.'); return; }
      openModal({
        title: 'Round ' + pad2(f.round) + ' — date & course', sub: 'Pairings stay locked to keep the season balanced.',
        body: '<div class="row-2"><div class="field"><label for="feDate">Date</label><input class="input" type="date" id="feDate" value="' + esc(f.date || '') + '"></div>' +
          '<div class="field"><label for="feCourse">Golf course</label><input class="input" id="feCourse" list="courseList" value="' + esc(f.course || '') + '" placeholder="e.g. Lake Karrinyup">' + courseDatalist() + '</div></div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="feSave">Save</button>',
        mount: function (m) {
          $('#feSave', m).onclick = async function () {
            var b = this; busy(b, true);
            try { await state.store.updateFixture({ id: f.id, date: $('#feDate', m).value || null, course: $('#feCourse', m).value.trim() }); closeModal(); toast('Round ' + pad2(f.round) + ' updated.'); await refresh(); }
            catch (e) { busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }

  function openSwap(id) {
    edit(function () {
      var f = fixtureById(id);
      var others = seasonFixtures(f.seasonId).filter(function (x) { return x.id !== f.id && !E.isCompleted(x) && E.pairKey(x.teamA[0], x.teamA[1]) !== E.pairKey(f.teamA[0], f.teamA[1]) && E.pairKey(x.teamB[0], x.teamB[1]) !== E.pairKey(f.teamA[0], f.teamA[1]); });
      openModal({
        title: 'Swap pairing — Round ' + pad2(f.round), sub: 'Swapping two unplayed rounds keeps every partnership at exactly four games.',
        body: others.length ? '<div class="field"><label for="swWith">Swap with</label><select class="input" id="swWith">' + others.map(function (x) { return '<option value="' + x.id + '">Round ' + pad2(x.round) + ' — ' + esc(teamName(x.teamA)) + ' v ' + esc(teamName(x.teamB)) + '</option>'; }).join('') + '</select></div><div class="callout info">Round ' + pad2(f.round) + ' is currently ' + esc(teamName(f.teamA)) + ' v ' + esc(teamName(f.teamB)) + '. Dates and courses stay with their rounds.</div>' : '<div class="callout">There are no other unplayed rounds with a different pairing to swap with.</div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button>' + (others.length ? '<button class="btn btn-primary" id="swGo">' + ICON.swap + 'Swap pairings</button>' : ''),
        mount: function (m) {
          var b = $('#swGo', m); if (!b) return;
          b.onclick = async function () { busy(b, true); try { await state.store.swapPairings(f.id, $('#swWith', m).value); closeModal(); toast('Pairings swapped. Season remains balanced.'); await refresh(); } catch (e) { busy(b, false); toast(e.message, 'error'); } };
        }
      });
    });
  }
  function courseDatalist() {
    var set = {}; state.data.fixtures.forEach(function (f) { if (f.course) set[f.course] = 1; });
    return '<datalist id="courseList">' + Object.keys(set).sort().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
  }

  /* ------------------------------------------------------------------ SUBMIT RESULT */
  // One screen: pick the round, enter course, date and the two gross scores, submit.
  // The same form corrects an existing result (opened from the Fixtures page).
  function openSubmit(fixtureId) {
    edit(function () {
      var s = season();
      if (!s) return toast('No active season.', 'error');
      var editing = !!fixtureId && E.isCompleted(fixtureById(fixtureId));
      var open = seasonFixtures().filter(function (f) { return !E.isCompleted(f); });
      if (!editing && !open.length) { toast('Every round of ' + seasonLabel(s) + ' has a result. Correct one from the Fixtures page.', 'error'); return; }
      var first = fixtureById(fixtureId) && (editing || !E.isCompleted(fixtureById(fixtureId))) ? fixtureById(fixtureId) : open[0];
      var form = { fixtureId: first.id, course: first.course || '', scoreA: editing ? first.scoreA : '', scoreB: editing ? first.scoreB : '', notes: editing ? first.notes : '' };
      form.date = first.date && (editing || first.date <= todayIso()) ? first.date : todayIso();
      var saving = false;
      var modal = openModal({ title: 'Submit result', body: '', wide: true });

      function result(f) {
        if (form.scoreA === '' || form.scoreB === '' || E.validateScores(form.scoreA, form.scoreB).length) return null;
        return E.outcome({ teamA: f.teamA, teamB: f.teamB, scoreA: +form.scoreA, scoreB: +form.scoreB, status: 'completed' });
      }
      function preview(f) {
        var o = result(f);
        if (!o) return '<div class="preview" id="pv"><span class="muted">Enter both gross scores. Lowest gross wins; points update automatically.</span></div>';
        var title = o.winner === 'DRAW' ? 'All square on ' + form.scoreA + ' — a draw' : esc(teamName(o.winners)) + ' win by ' + plural(o.margin, 'stroke');
        return '<div class="preview ' + (o.winner === 'DRAW' ? '' : 'win') + '" id="pv"><div class="pv-title">' + title + '</div><div class="pv-points">' +
          f.teamA.concat(f.teamB).map(function (p) { return '<div>' + esc(nm(p)) + '<b class="' + (o.points[p] ? 'plus' : '') + '">+' + o.points[p] + '</b></div>'; }).join('') + '</div></div>';
      }
      function draw() {
        var f = fixtureById(form.fixtureId), o = result(f);
        var roundField = editing
          ? '<div class="field"><span class="lbl">Round</span><div class="input" style="display:flex;align-items:center;background:var(--card-2)">Round ' + pad2(f.round) + ' — correcting the recorded result</div></div>'
          : '<div class="field"><label for="srRound">Round</label><select class="input" id="srRound">' + open.map(function (x) { return '<option value="' + x.id + '"' + (x.id === form.fixtureId ? ' selected' : '') + '>Round ' + pad2(x.round) + ' — ' + esc(teamName(x.teamA)) + ' v ' + esc(teamName(x.teamB)) + '</option>'; }).join('') + '</select></div>';
        modal.draw({
          title: editing ? 'Correct result' : 'Submit result', sub: esc(seasonLabel(s)) + ' · 2-person Ambrose · gross strokes', wide: true,
          body: '<form id="srForm" novalidate>' + HONEYPOT + roundField +
            '<div class="row-2"><div class="field"><label for="srCourse">Golf course</label><input class="input" id="srCourse" list="courseList" maxlength="80" value="' + esc(form.course) + '" placeholder="e.g. Wembley Golf Course" required>' + courseDatalist() + '<div class="field-error" data-err="course"></div></div>' +
            '<div class="field"><label for="srDate">Date played</label><input class="input" type="date" id="srDate" value="' + esc(form.date) + '" max="' + todayIso() + '" required><div class="field-error" data-err="date"></div></div></div>' +
            '<div class="row-2 keep">' + ['A', 'B'].map(function (side) {
              var t = side === 'A' ? f.teamA : f.teamB;
              return '<div class="team-box' + (o && o.winner === side ? ' winner' : '') + '" id="tb' + side + '"><div class="tb-head"><span class="tb-tag">Team ' + side + '</span>' + pair(t, 'sm') + '</div><div class="tb-names">' + esc(teamName(t)) + '</div>' +
                '<div class="field" style="margin:10px 0 0"><label for="sr' + side + '">Gross strokes</label><input class="input score-input" id="sr' + side + '" type="number" inputmode="numeric" min="' + E.MIN_SCORE + '" max="' + E.MAX_SCORE + '" step="1" value="' + esc(side === 'A' ? form.scoreA : form.scoreB) + '" placeholder="—" required><div class="field-error" data-err="' + side + '"></div></div></div>';
            }).join('') + '</div>' +
            '<div style="margin-top:14px">' + preview(f) + '</div>' +
            '<details class="more"' + (form.notes ? ' open' : '') + '><summary>Add a note <span class="muted">(optional)</span></summary><textarea class="input" id="srNotes" maxlength="300" aria-label="Notes" placeholder="Shot of the day, conditions, excuses…">' + esc(form.notes || '') + '</textarea></details>' +
            (MODE === 'demo' ? '<p class="small muted" style="margin:10px 0 0">Demo mode: saved only in this browser.</p>' : '') + '</form>',
          foot: '<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="srSave">' + ICON.check + (editing ? 'Save correction' : 'Submit result') + '</button>',
          mount: bind
        });
      }
      function bind(m) {
        var rs = $('#srRound', m);
        if (rs) rs.onchange = function () { var was = fixtureById(form.fixtureId), now = fixtureById(rs.value); if (!form.course || form.course === was.course) form.course = now.course || form.course; form.fixtureId = rs.value; draw(); };
        $('#srDate', m).oninput = function () { form.date = this.value; };
        $('#srCourse', m).oninput = function () { form.course = this.value; };
        $('#srNotes', m).oninput = function () { form.notes = this.value; };
        ['A', 'B'].forEach(function (side) {
          $('#sr' + side, m).oninput = function () {
            form['score' + side] = this.value === '' ? '' : Number(this.value);
            var f = fixtureById(form.fixtureId), o = result(f);
            $('#pv', m).outerHTML = preview(f);
            $('#tbA', m).classList.toggle('winner', !!o && o.winner === 'A'); $('#tbB', m).classList.toggle('winner', !!o && o.winner === 'B');
            this.classList.remove('invalid'); $('[data-err="' + side + '"]', m).textContent = '';
          };
        });
        $('#srSave', m).onclick = function () { if (valid(m)) save(m, this); };
        $('#srForm', m).onsubmit = function (e) { e.preventDefault(); if (valid(m)) save(m, $('#srSave', m)); };
      }
      function valid(m) {
        var ok = true;
        function err(k, msg, input) { ok = false; $('[data-err="' + k + '"]', m).textContent = msg; if (input) input.classList.add('invalid'); }
        $$('.field-error', m).forEach(function (x) { x.textContent = ''; }); $$('.invalid', m).forEach(function (x) { x.classList.remove('invalid'); });
        if (!String(form.course || '').trim()) err('course', 'Enter the golf course.', $('#srCourse', m));
        if (!form.date) err('date', 'Choose the date the round was played.', $('#srDate', m));
        else if (form.date > todayIso()) err('date', 'A result can’t be recorded for a future date.', $('#srDate', m));
        ['A', 'B'].forEach(function (side) {
          var v = form['score' + side];
          if (v === '' || E.validateScores(v, 72).length) err(side, v === '' ? 'Required.' : 'Whole number between ' + E.MIN_SCORE + ' and ' + E.MAX_SCORE + '.', $('#sr' + side, m));
        });
        if (!editing && E.isCompleted(fixtureById(form.fixtureId))) { ok = false; toast('That round already has a result.', 'error'); }
        if (!ok) { var first = $('.invalid', m); if (first) first.focus(); }
        return ok;
      }
      async function save(m, btn) {
        if (saving) return;                       // double-tap protection
        if (trapped(m)) { closeModal(); return; }
        saving = true; busy(btn, true);
        var f = fixtureById(form.fixtureId), o = result(f);
        try {
          await state.store.saveResult({ fixtureId: f.id, date: form.date, course: form.course.trim(), scoreA: +form.scoreA, scoreB: +form.scoreB, notes: (form.notes || '').trim(), mode: editing ? 'update' : 'create' });
          closeModal();
          toast(o.winner === 'DRAW' ? 'Round ' + pad2(f.round) + ' saved — all square.' : 'Round ' + pad2(f.round) + ' saved — ' + teamName(o.winners) + ' win by ' + o.margin + '.');
          await refresh('#/clubhouse');
        } catch (e) { saving = false; busy(btn, false); toast(e.message || 'Could not save the result.', 'error'); refresh(); }
      }
      draw();
    });
  }

  /* ------------------------------------------------------------------ PLAYERS */
  function renderPlayers() {
    var c = ctx();
    var cards = c.table.slice().sort(function (a, b) { return c.ids.indexOf(a.id) - c.ids.indexOf(b.id); }).map(function (r) {
      var p = P(r.id);
      return '<a class="card player-card" href="#/players/' + r.id + '" style="--pc:' + p.color + '">' + avatar(r.id) +
        '<span class="pos">' + (r.played ? ordinal(r.rank) + (r.shared ? ' (shared)' : '') : 'Yet to tee off') + '</span><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="pts"><strong>' + r.points + '</strong> ' + (r.points === 1 ? 'pt' : 'pts') + '</span>' +
        '<span class="rec"><span class="rec-pill">' + r.wins + 'W</span><span class="rec-pill">' + r.draws + 'D</span><span class="rec-pill">' + r.losses + 'L</span></span>' +
        '<span style="margin-top:10px">' + formHtml(r.form) + '</span>' + (p.quote ? '<span class="pc-quote">“' + esc(p.quote) + '”</span>' : '') + '</a>';
    }).join('');
    app.innerHTML = '<div class="page container">' + hero('The Field', 'Four golfers. Twelve rounds. One championship.', roundMeta(c)) +
      '<div class="toolbar">' + playersSwitch('players') + '</div>' +
      '<div class="grid grid-4 players-grid">' + cards + '</div></div>';
  }
  /** Fines live inside the Players tab: a two-way switch at the top of both pages. */
  function playersSwitch(on) {
    return '<nav class="seg" aria-label="Players or fines"><a href="#/players"' + (on === 'players' ? ' class="on" aria-current="page"' : '') + '>Players</a><a href="#/fines"' + (on === 'fines' ? ' class="on" aria-current="page"' : '') + '>Fines</a></nav>';
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function formHtml(form) { var f = form.slice(-5); return '<span class="form" aria-label="Recent form">' + (f.length ? f.map(function (x) { return '<span class="' + x + '">' + x + '</span>'; }).join('') : '<span class="none">No form yet</span>') + '</span>'; }

  function renderPlayer(id) {
    var p = P(id); if (!state.data.players.some(function (x) { return x.id === id; })) { location.hash = '#/players'; return; }
    var c = ctx(), r = c.row(id);
    var chem = E.partnerStats(id, c.ids, c.fixtures);
    var history = c.done.map(function (f) { return E.playerResult(f, id); }).filter(Boolean);
    var fines = c.fines.filter(function (f) { return f.playerId === id; }).sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var fineTot = fines.reduce(function (s, f) { return s + f.amount; }, 0);
    var html = '<div class="page container">' +
      '<a class="back-link" href="#/players">' + ICON.back + 'All players</a>' +
      '<section class="profile-hero" style="--pc:' + p.color + '">' + avatar(id, 'xl') + '<div><div class="eyebrow">' + esc(seasonLabel(c.season)) + ' · ' + (r.played ? ordinal(r.rank) + (r.shared ? ' (shared)' : '') + ' in the championship' : 'Yet to tee off') + '</div><h1>' + esc(p.name) + '</h1>' +
'<div class="hero-tags"><span class="tag">' + pts(r.points) + '</span><span class="tag">' + r.wins + 'W · ' + r.draws + 'D · ' + r.losses + 'L</span><span class="tag">Stroke diff ' + (r.diff > 0 ? '+' : '') + r.diff + '</span></div></div></section>' +
      playerCard(p) +
      '<div class="card" style="margin-bottom:18px"><div class="kpis">' +
      kpi('Position', r.played ? ordinal(r.rank) : '—', r.played && r.shared ? 'Shared' : 'of 4') + kpi('Points', r.points, 'Max ' + (2 * (c.season.totalRounds || 12))) + kpi('Played', r.played, (c.season.totalRounds || 12) - r.played + ' to play') + kpi('Win rate', pct(r.winPct), r.wins + 'W ' + r.draws + 'D ' + r.losses + 'L') +
      kpi('Avg team gross', num1(r.avgGross), 'Ambrose, per round') + kpi('Best team gross', r.best == null ? '—' : r.best, 'Lowest') + kpi('Worst team gross', r.worst == null ? '—' : r.worst, 'Highest') + '<div class="kpi"><div class="k">Current form</div><div style="margin-top:8px">' + formHtml(r.form) + '</div></div>' +
      '</div></div>' +
      '<div class="grid grid-2"><section class="card chart-card"><h2>Points Progression</h2><p class="card-sub">Cumulative points by round, against the field</p><div class="mini-chart"><canvas id="pChart" role="img" aria-label="' + esc(p.name) + ' cumulative points"></canvas></div></section>' +
      '<section class="card"><h2>Partner Chemistry</h2><p class="card-sub">Team results with each playing partner</p><div class="chem" style="margin-top:14px;grid-template-columns:minmax(0,1fr)">' + chem.map(function (x) {
        var tot = x.played || 1;
        return '<div class="chem-card"><div class="chem-head">' + pair([id, x.partner], 'sm') + '<div><div class="nm">with ' + esc(nm(x.partner)) + '</div><div class="sub">' + plural(x.played, 'round') + ' together · ' + pts(x.points) + '</div></div><div style="margin-left:auto;font-family:var(--serif);font-size:22px;font-weight:600">' + pct(x.winPct) + '</div></div>' +
          '<div class="chem-bar" aria-hidden="true"><i style="width:' + (x.wins / tot * 100) + '%;background:var(--green-800)"></i><i style="width:' + (x.draws / tot * 100) + '%;background:#D8C78F"></i><i style="width:' + (x.losses / tot * 100) + '%;background:#E3A497"></i></div>' +
          '<div class="chem-stats"><div><b>' + x.wins + '-' + x.draws + '-' + x.losses + '</b>W-D-L</div><div><b>' + num1(x.avgGross) + '</b>Avg gross</div><div><b>' + pct(x.winPct) + '</b>Win %</div></div></div>';
      }).join('') + '</div></section></div>' +
      '<section class="card" style="margin-bottom:18px"><h2>Match History</h2>' + (history.length ? '<div class="table-wrap"><table class="data-table" style="margin-top:12px"><thead><tr><th>Rd</th><th class="hide-sm">Date</th><th>Partner</th><th>Opponents</th><th class="num">Score</th><th>Result</th><th class="num">Pts</th></tr></thead><tbody>' +
        history.map(function (h) { return '<tr class="clickable" data-fixture="' + h.fixture.id + '"><td><b>' + pad2(h.fixture.round) + '</b></td><td class="hide-sm">' + fmtDate(h.fixture.date) + '<div class="small muted">' + esc(h.fixture.course) + '</div></td><td><span class="inline-player">' + avatar(h.partner, 'xs') + esc(nm(h.partner)) + '</span></td><td>' + esc(teamName(h.opponents)) + '</td><td class="num">' + h.own + ' – ' + h.opp + '</td><td><span class="res ' + h.result + '">' + h.result + '</span></td><td class="num"><b>+' + h.points + '</b></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="empty"><h4>No rounds played</h4><p>' + esc(p.name) + '’s match history will appear here after the first recorded round.</p></div>') + '</section>' +
      '<section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>Disciplinary Record</h2><p class="card-sub">' + plural(fines.length, 'offence') + ' · ' + money(fineTot) + ' total · fines never affect championship points</p></div><a class="link-arrow" href="#/fines">Committee ' + ICON.arrow + '</a></div>' +
      (fines.length ? '<div class="table-wrap"><table class="data-table" style="margin-top:12px"><thead><tr><th>Offence</th><th>Round</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' + fines.map(function (f) { var fx = fixtureById(f.fixtureId); return '<tr><td>' + esc(f.categoryName) + (f.notes ? '<div class="small muted">' + esc(f.notes) + '</div>' : '') + '</td><td>' + (fx ? 'R' + pad2(fx.round) : '—') + '</td><td class="num">' + money(f.amount) + '</td><td><span class="badge ' + (f.paid ? 'paid' : 'unpaid') + '" style="margin:0">' + (f.paid ? 'Paid' : 'Owing') + '</span></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="empty"><h4>Spotless</h4><p>The Committee has nothing on ' + esc(p.name) + '. Yet.</p></div>') + '</section></div>';
    app.innerHTML = html;
    mountPlayerChart(id, c);
  }
  /* ---- Player card: favourite quote, best shot, biggest strength, biggest weakness ---- */
  var BIO_FIELDS = [
    ['quote', 'Favourite quote', 'e.g. “It’s not a hazard if you never leave it.”'],
    ['bestShot', 'Best shot', 'e.g. Holed a 7-iron on the 4th at Wembley'],
    ['strength', 'Biggest strength', 'e.g. Lag putting under pressure'],
    ['weakness', 'Biggest weakness', 'e.g. Anything inside 100 metres']
  ];
  function playerCard(p) {
    var any = BIO_FIELDS.some(function (f) { return p[f[0]]; });
    return '<section class="card bio-card" aria-labelledby="bioT"><div class="card-head"><h2 id="bioT">Player Card</h2><button class="btn btn-ghost btn-sm" data-edit-bio="' + p.id + '">' + ICON.edit + (any ? 'Edit' : 'Fill it in') + '</button></div>' +
      '<div class="bio-grid">' + BIO_FIELDS.map(function (f) {
        var v = p[f[0]];
        return '<div class="bio-item' + (f[0] === 'quote' ? ' quote' : '') + '"><span class="k">' + f[1] + '</span><span class="v' + (v ? '' : ' unset') + '">' + (v ? (f[0] === 'quote' ? '“' + esc(v) + '”' : esc(v)) : 'Not added yet') + '</span></div>';
      }).join('') + '</div></section>';
  }
  function openBio(id) {
    edit(function () {
      var p = P(id), saving = false;
      openModal({
        title: esc(p.name) + '’s player card', sub: 'Keep it short. Anyone can edit this.',
        body: HONEYPOT + BIO_FIELDS.map(function (f) {
          return '<div class="field"><label for="bio-' + f[0] + '">' + f[1] + '</label><input class="input" id="bio-' + f[0] + '" maxlength="140" value="' + esc(p[f[0]] || '') + '" placeholder="' + esc(f[2]) + '"></div>';
        }).join(''),
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="bioSave">' + ICON.check + 'Save</button>',
        mount: function (m) {
          $('#bioSave', m).onclick = async function () {
            if (saving) return;
            if (trapped(m)) { closeModal(); return; }
            var data = {}; BIO_FIELDS.forEach(function (f) { data[f[0]] = $('#bio-' + f[0], m).value.trim(); });
            var b = this; saving = true; busy(b, true);
            try { await state.store.updatePlayerProfile(id, data); closeModal(); toast(p.name + '’s player card updated.'); await refresh(); }
            catch (e) { saving = false; busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }
  function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
  function mountPlayerChart(id, c) {
    var cv = $('#pChart'); if (!cv || !chartAvailable()) return;
    var total = c.season.totalRounds || 12, labels = []; for (var i = 0; i <= total; i++) labels.push('R' + i);
    var ch = new window.Chart(cv, {
      type: 'line',
      data: { labels: labels, datasets: players().map(function (p) {
        var me = p.id === id;
        return { label: p.name, data: c.timeline.series[p.id], borderColor: me ? p.color : 'rgba(120,120,110,.28)', backgroundColor: me ? p.color : 'rgba(120,120,110,.28)', borderWidth: me ? 3 : 1.5, pointRadius: me ? 4 : 0, tension: 0, order: me ? 0 : 1 };
      }) },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, maxRotation: 0 } }, y: { min: 0, max: 24, ticks: { stepSize: 4, font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(60,60,50,.1)' } } },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#062E20', itemSort: function (a, b) { return b.parsed.y - a.parsed.y; }, callbacks: { label: function (it) { return ' ' + it.dataset.label + ': ' + pts(it.parsed.y); } } } }
      }
    });
    state.charts.push(ch);
  }

  /* ------------------------------------------------------------------ FINES */
  function renderFines() {
    var c = ctx(), fs = c.finesSum;
    var maxTot = Math.max.apply(null, fs.rows.map(function (r) { return r.total; }).concat([1]));
    var hist = c.fines.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var cats = state.data.fineCategories.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    app.innerHTML = '<div class="page container">' + hero('The Disciplinary Committee', 'Justice is swift, fair and payable in cash. Fines fund the end-of-season dinner and have no bearing on championship points.', '') +
      ('<div class="toolbar">' + playersSwitch('fines') + '<div class="btn-row"><button class="btn btn-cream" data-action="add-category">' + ICON.plus + 'New offence</button><button class="btn btn-gold" data-action="add-fine">' + ICON.gavel + 'Issue a fine</button></div></div>') +
      '<div class="grid fines-hero-stats">' +
      '<div class="card stat" style="border:0">' + '<span class="stat-icon">' + ICON.coins + '</span><span class="stat-body"><span class="stat-label">Total fines pot</span><div class="stat-value">' + money(fs.total) + '</div><div class="stat-sub">' + plural(fs.count, 'offence') + '</div></span></div></div>' +
      '<div class="grid grid-race"><section class="card"><h2>Offence Register</h2><p class="card-sub">Every charge laid before the Committee this season</p>' +
      (hist.length ? '<div class="table-wrap"><table class="data-table" style="margin-top:12px"><thead><tr><th>Offender</th><th>Offence</th><th class="hide-sm">Round</th><th class="num">Amount</th><th>Status</th>' + ('<th class="num"><span class="visually-hidden">Actions</span></th>') + '</tr></thead><tbody>' +
        hist.map(function (f) {
          var fx = fixtureById(f.fixtureId);
          return '<tr><td><span class="inline-player">' + avatar(f.playerId, 'xs') + esc(nm(f.playerId)) + '</span></td><td>' + esc(f.categoryName) + (f.notes ? '<div class="small muted">' + esc(f.notes) + '</div>' : '') + '</td><td class="hide-sm">' + (fx ? 'R' + pad2(fx.round) : '—') + '</td><td class="num"><b>' + money(f.amount) + '</b></td>' +
            '<td>' + ('<button class="badge ' + (f.paid ? 'paid' : 'unpaid') + '" style="margin:0;border:0;cursor:pointer" data-toggle-paid="' + f.id + '" title="Toggle paid">' + (f.paid ? 'Paid' : 'Owing') + '</button>') + '</td>' +
            ('<td class="num"><div class="fine-row-actions"><button class="icon-btn" data-edit-fine="' + f.id + '" aria-label="Edit fine">' + ICON.edit + '</button><button class="icon-btn" data-del-fine="' + f.id + '" aria-label="Delete fine">' + ICON.trash + '</button></div></td>') + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty"><div class="empty-icon">' + ICON.gavel + '</div><h4>The register is clean</h4><p>No offences have been recorded. The Committee finds this deeply suspicious.</p>' + ('<button class="btn btn-primary" data-action="add-fine">' + ICON.plus + 'Issue the first fine</button>') + '</div>') +
      '</section><section class="card"><h2>Rogues’ Gallery</h2><p class="card-sub">Individual fines leaderboard</p><div style="margin-top:8px">' +
      fs.rows.map(function (r, i) { return '<div class="lb-row"><span class="rank-num">' + (i + 1) + '</span><div><span class="inline-player">' + avatar(r.id, 'sm') + esc(nm(r.id)) + '</span><div class="lb-bar"><i style="width:' + (r.total / maxTot * 100) + '%"></i></div></div><div class="lb-amt">' + money(r.total) + '<small>' + plural(r.count, 'offence') + (r.outstanding ? ' · ' + money(r.outstanding) + ' owing' : '') + '</small></div></div>'; }).join('') +
      '</div><p class="committee-quote">“Ignorance of the tariff is no defence.”</p></section></div>' +
      '<section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>Tariff of Penalties</h2><p class="card-sub">Standard fines. The Committee may adjust any amount at its discretion.</p></div></div><div class="tariff" style="margin-top:10px">' +
      cats.filter(function (k) { return k.active; }).map(function (k) { return '<div class="tariff-item"><span>' + esc(k.name) + '</span><span style="display:flex;gap:8px;align-items:center"><span class="amt">' + money(k.amount) + '</span>' + ('<button class="icon-btn" data-edit-cat="' + k.id + '" aria-label="Edit ' + esc(k.name) + '">' + ICON.edit + '</button>') + '</span></div>'; }).join('') +
      '</div></section></div>';
  }

  function openFine(fineId) {
    edit(function () {
      var f = fineId ? state.data.fines.filter(function (x) { return x.id === fineId; })[0] : null;
      var cats = state.data.fineCategories.filter(function (c) { return c.active || (f && c.id === f.categoryId); });
      if (!cats.length) { toast('Add an offence to the tariff first.', 'error'); return; }
      var latest = E.latestFixture(seasonFixtures());
      var d = f || { playerId: '', categoryId: cats[0].id, amount: cats[0].amount, fixtureId: latest ? latest.id : '', notes: '', paid: false };
      var fx = seasonFixtures(), saving = false;
      function hint(m) {
        var r = fixtureById($('#fnR', m).value), amt = $('#fnA', m).value;
        $('#fnHint', m).textContent = (r ? 'Round ' + pad2(r.round) : 'No round') + ' · ' + money(amt) + ($('#fnPaid', m).checked ? ' · paid' : '');
      }
      openModal({
        title: f ? 'Correct fine' : 'Issue a fine', sub: 'Pick the offender and the offence. That’s it.',
        body: HONEYPOT + '<div class="field"><span class="lbl" id="fnPl">Offender</span><div class="pick" role="radiogroup" aria-labelledby="fnPl">' + players().map(function (p) {
            return '<label class="pick-item"><input type="radio" name="fnP" value="' + p.id + '"' + (p.id === d.playerId ? ' checked' : '') + '>' + avatar(p.id, 'sm') + '<span>' + esc(p.name) + '</span></label>';
          }).join('') + '</div><div class="field-error" id="fnPErr"></div></div>' +
          '<div class="field"><label for="fnC">Offence</label><select class="input" id="fnC">' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === d.categoryId ? ' selected' : '') + '>' + esc(c.name) + ' — ' + money(c.amount) + '</option>'; }).join('') + '</select></div>' +
          '<details class="more"' + (f ? ' open' : '') + '><summary>More options <span class="muted" id="fnHint"></span></summary>' +
          '<div class="row-2 keep"><div class="field"><label for="fnR">Round</label><select class="input" id="fnR"><option value="">Not tied to a round</option>' + fx.map(function (x) { return '<option value="' + x.id + '"' + (x.id === d.fixtureId ? ' selected' : '') + '>Round ' + pad2(x.round) + (x.date ? ' · ' + fmtDate(x.date) : '') + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="fnA">Amount ($)</label><input class="input" id="fnA" type="number" min="0" max="500" step="0.5" inputmode="decimal" value="' + esc(d.amount) + '"><div class="field-error" id="fnAErr"></div></div></div>' +
          '<div class="field"><label for="fnN">Notes</label><textarea class="input" id="fnN" maxlength="300" style="min-height:60px" placeholder="Evidence for the prosecution…">' + esc(d.notes || '') + '</textarea></div>' +
          (f ? '' : '<label class="check"><input type="checkbox" id="fnPaid"> Already paid</label>') + '</details>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="fnSave">' + ICON.gavel + (f ? 'Save changes' : 'Issue fine') + '</button>',
        mount: function (m) {
          if (!$('#fnPaid', m)) { var ghost = document.createElement('input'); ghost.type = 'checkbox'; ghost.id = 'fnPaid'; ghost.hidden = true; ghost.checked = !!d.paid; m.appendChild(ghost); }
          hint(m);
          $('.pick', m).onchange = function () { $('#fnPErr', m).textContent = ''; };
          $('#fnC', m).onchange = function () { $('#fnA', m).value = catById(this.value).amount; hint(m); };
          $('#fnR', m).onchange = $('#fnA', m).oninput = $('#fnPaid', m).onchange = function () { hint(m); };
          $('#fnSave', m).onclick = async function () {
            if (saving) return;
            if (trapped(m)) { closeModal(); return; }
            var who = $('input[name="fnP"]:checked', m), amt = $('#fnA', m).value;
            if (!who) { $('#fnPErr', m).textContent = 'Choose who is being fined.'; return; }
            if (amt === '' || !(Number(amt) >= 0) || Number(amt) > 500) { $('.more', m).open = true; $('#fnAErr', m).textContent = 'Enter an amount between $0 and $500.'; $('#fnA', m).classList.add('invalid'); return; }
            var payload = { seasonId: f ? f.seasonId : state.seasonId, playerId: who.value, categoryId: $('#fnC', m).value, fixtureId: $('#fnR', m).value || null, amount: Number(amt), notes: $('#fnN', m).value.trim(), paid: $('#fnPaid', m).checked };
            var b = this; saving = true; busy(b, true);
            try {
              if (f) await state.store.updateFine(f.id, payload); else await state.store.addFine(payload);
              closeModal(); toast(f ? 'Fine corrected.' : nm(payload.playerId) + ' fined ' + money(payload.amount) + '. The Committee thanks you.'); await refresh();
            } catch (e) { saving = false; busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }
  function openCategory(catId) {
    edit(function () {
      var c = catId ? catById(catId) : null;
      openModal({
        title: c ? 'Edit offence' : 'New offence', sub: 'Adds to the tariff of penalties.',
        body: '<div class="field"><label for="ctN">Offence</label><input class="input" id="ctN" value="' + esc(c ? c.name : '') + '" placeholder="e.g. Hits the cart path"><div class="field-error" id="ctErr"></div></div>' +
          '<div class="field"><label for="ctA">Default amount ($)</label><input class="input" id="ctA" type="number" min="0" step="0.5" value="' + esc(c ? c.amount : 2) + '"></div>' +
          (c ? '<label class="check"><input type="checkbox" id="ctActive"' + (c.active ? ' checked' : '') + '> Active (available for new fines)</label>' : ''),
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ctSave">Save</button>',
        mount: function (m) {
          $('#ctSave', m).onclick = async function () {
            var name = $('#ctN', m).value.trim(), amt = $('#ctA', m).value;
            if (!name) { $('#ctErr', m).textContent = 'Name the offence.'; return; }
            if (amt === '' || !(Number(amt) >= 0)) { $('#ctErr', m).textContent = 'Enter a valid amount.'; return; }
            var dupe = state.data.fineCategories.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!c || x.id !== c.id); })[0];
            if (dupe && (dupe.active || c)) { $('#ctErr', m).textContent = 'That offence already exists.'; return; }
            var target = c || dupe;                                   // a retired offence of the same name is brought back
            var b = this; busy(b, true);
            try { await state.store.saveCategory({ id: target && target.id, name: target ? target.name : name, amount: Number(amt), active: c ? $('#ctActive', m).checked : true }); closeModal(); toast(dupe && !c ? '“' + dupe.name + '” is back on the tariff.' : 'Tariff updated.'); await refresh(); }
            catch (e) { busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }

  /* ------------------------------------------------------------------ TEE TIME */
  // Find the next date all four can play. The calendar opens three weeks after
  // the last round (rules in teetime.js) and feeds straight into the fixture.
  var TEE_PLAYER_KEY = 'dd-tee-player';
  var tee = { player: null, pending: {}, inflight: null, timer: null, error: '', savedAt: 0, bulkPrev: {} };
  var writeSeq = 0;
  try { tee.player = localStorage.getItem(TEE_PLAYER_KEY) || null; } catch (e) {}
  function teeTz() { return cfg.timezone || T.TZ; }
  function time12(t) { if (!t) return ''; var h = +t.slice(0, 2), m = t.slice(3, 5); return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function slotLabel(i) { return T.SLOTS[i].label; }
  function liveProposal(fixtureId) { return (state.data.proposals || []).filter(function (p) { return p.fixtureId === fixtureId && p.status !== 'withdrawn'; })[0] || null; }
  function proposalById(id) { return (state.data.proposals || []).filter(function (p) { return p.id === id; })[0]; }
  function lastPlayedFixture() { return E.latestFixture(state.data.fixtures); }

  /** Saved availability with this device's unsaved / in-flight taps laid on top. */
  function availMap() {
    var m = {};
    ids().forEach(function (p) { m[p] = {}; });
    (state.data.availability || []).forEach(function (a) { if (m[a.playerId]) m[a.playerId][a.weekend] = a.mask; });
    [tee.inflight, tee.pending].forEach(function (layer) {
      if (!layer) return;
      Object.keys(layer).forEach(function (pid) {
        Object.keys(layer[pid]).forEach(function (w) { var ch = layer[pid][w]; m[pid][w] = T.apply(m[pid][w] || 0, ch.s, ch.c); });
      });
    });
    return m;
  }
  function fixturePlayers(f) { return ids().filter(function (p) { return f.teamA.indexOf(p) !== -1 || f.teamB.indexOf(p) !== -1; }); }
  /**
   * A round counts as locked in once its date is settled: tee time set, all
   * four confirmed a proposed date, or a date entered on the Fixtures page.
   */
  function lockOf(f) {
    if (E.isCompleted(f)) return null;
    var p = liveProposal(f.id);
    if (p && p.status === 'scheduled') return { kind: 'scheduled', date: p.date, fixture: f, proposal: p };
    if (p && T.proposalState(fixturePlayers(f), p.responses).allIn) return { kind: 'agreed', date: p.date, fixture: f, proposal: p };
    if (!p && f.date) return { kind: 'dated', date: f.date, fixture: f };
    return null;
  }
  /**
   * Tee Time plans the first unplayed round that isn't locked in yet. Its
   * calendar opens three weeks after the latest of: the last round played, or
   * any earlier round already locked in (so locking in Round 1 for 13 Dec
   * moves the calendar on to Round 2 from the weekend of 1 Jan).
   */
  function teeCtx() {
    var c = ctx(), today = T.today(teeTz()), locked = [], f = null;
    c.fixtures.filter(function (x) { return !E.isCompleted(x); }).forEach(function (x) {
      if (f) return;
      var L = lockOf(x);
      if (L) locked.push(L); else f = x;
    });
    if (!f) return { c: c, fixture: null, locked: locked, today: today };
    var played = lastPlayedFixture();
    var anchor = played ? { date: played.date, round: played.round, kind: 'played' } : null;
    locked.forEach(function (L) { if (!anchor || L.date > anchor.date) anchor = { date: L.date, round: L.fixture.round, kind: L.kind }; });
    var win = T.windowFor({ lastPlayed: anchor ? anchor.date : null, today: today, weeks: f.teeWeeks });
    var players = fixturePlayers(f);
    var o = { players: players, weekends: win.weekends, avail: availMap(), today: today, now: T.nowTime(teeTz()), preferred: cfg.teePreferredWindows || [] };
    return { c: c, fixture: f, locked: locked, last: anchor, today: today, win: win, o: o, players: players, best: T.best(o), overlaps: T.overlaps(o).slice(0, 3), blocker: T.blocker(o), proposal: liveProposal(f.id) };
  }
  var LOCK_WORD = { played: '', scheduled: 'scheduled', agreed: 'date agreed', dated: 'date set' };

  /** Rounds already locked in but not yet played, shown above the round being planned. */
  function teeLockedCards(t) {
    return (t.locked || []).map(function (L) {
      var f = L.fixture, p = L.proposal, k, when, sub, acts;
      if (L.kind === 'scheduled') {
        k = 'Scheduled'; when = T.shortDate(p.date) + ' · ' + time12(p.teeTime); sub = esc(p.course) + ' · all four confirmed. Booking the course is up to you.';
        acts = '<button class="btn btn-ghost btn-sm" data-tee="schedule" data-id="' + p.id + '">' + ICON.edit + 'Change</button><button class="btn btn-ghost btn-sm" data-tee="withdraw" data-id="' + p.id + '">Cancel</button>';
      } else if (L.kind === 'agreed') {
        k = 'Date agreed by all four'; when = T.shortDate(p.date) + ' · ' + slotLabel(p.slot); sub = 'Set the tee time and course once it’s booked.';
        acts = '<button class="btn btn-primary btn-sm" data-tee="schedule" data-id="' + p.id + '">' + ICON.check + 'Set tee time</button><button class="btn-link" data-tee="withdraw" data-id="' + p.id + '">Withdraw</button>';
      } else {
        k = 'Date set on Fixtures'; when = T.shortDate(f.date) + (f.teeTime ? ' · ' + time12(f.teeTime) : ''); sub = esc(f.course || 'Course TBC');
        acts = '<button class="btn btn-ghost btn-sm" data-fixture="' + f.id + '">' + ICON.edit + 'Edit</button>';
      }
      if (L.date < t.today) {   // the day has been and gone: most likely played, so ask for the result
        sub = 'That date has passed. Played it? Record the result and Tee Time moves on to the next round.';
        acts = '<button class="btn btn-primary btn-sm" data-tee="record" data-id="' + f.id + '">' + ICON.flag + 'Record result</button>' + acts.replace('btn btn-primary btn-sm', 'btn btn-ghost btn-sm');
      }
      return '<section class="card tee-next tee-locked" aria-label="Round ' + f.round + ' locked in"><div class="tn-top"><span class="tn-round">Round ' + pad2(f.round) + '</span>' +
        '<span class="tn-pair">' + esc(teamName(f.teamA)) + ' <i>v</i> ' + esc(teamName(f.teamB)) + '</span></div>' +
        '<div class="tn-box scheduled"><span class="tn-icon">' + ICON.flag + '</span><div class="tn-main"><span class="tn-k">' + k + '</span><span class="tn-when">' + when + '</span><span class="tn-sub">' + sub + '</span></div>' +
        '<div class="tn-actions">' + acts + '</div></div></section>';
    }).join('');
  }

  function renderTeeTime() {
    var c = ctx();
    var html = '<div class="page container">' + hero('Tee Time', 'Pick your name, tap when you’re free, and the next date sorts itself out.', roundMeta(c));
    if (state.data.tee && state.data.tee.ready === false) {
      html += '<div class="card empty"><div class="empty-icon">' + ICON.alert + '</div><h4>Tee Time needs a one-off database update</h4><p>Run the latest <b>supabase-schema.sql</b> in the Supabase SQL Editor (see the README), then refresh. Everything else on the site is unaffected.</p></div>';
    } else if (!c.next) {
      html += '<div class="card empty"><div class="empty-icon">' + ICON.trophy + '</div><h4>Season complete</h4><p>Every round of ' + esc(seasonLabel(c.season)) + ' has been played. There’s nothing left to schedule.</p></div>';
    } else {
      var t = teeCtx();
      html += teeLockedCards(t);
      if (t.fixture) html += teeNextCard(t) + teeAvailCard(t) + teeOverlapCard(t) + teeFootnote(t);
      else html += '<div class="card empty"><div class="empty-icon">' + ICON.calendar + '</div><h4>Every remaining round has a date</h4><p>Nothing left to find a time for. Enter results as rounds are played.</p></div>';
    }
    app.innerHTML = html + '</div>';
  }

  function teeNextCard(t) {
    var f = t.fixture, p = t.proposal, box;
    if (p && p.status === 'scheduled') {
      box = '<div class="tn-box scheduled"><span class="tn-icon">' + ICON.flag + '</span><div class="tn-main"><span class="tn-k">Scheduled</span>' +
        '<span class="tn-when">' + T.shortDate(p.date) + ' · ' + time12(p.teeTime) + '</span><span class="tn-sub">' + esc(p.course) + ' · all four confirmed. Booking the course is up to you.</span></div>' +
        '<div class="tn-actions"><button class="btn btn-ghost btn-sm" data-tee="schedule" data-id="' + p.id + '">' + ICON.edit + 'Change</button><button class="btn btn-ghost btn-sm" data-tee="withdraw" data-id="' + p.id + '">Cancel</button></div></div>';
    } else if (p) {
      var st = T.proposalState(t.players, p.responses), me = tee.player, mine = me ? p.responses[me] : null;
      box = '<div class="tn-box proposed' + (st.declined.length ? ' declined' : '') + '"><span class="tn-icon">' + ICON.flag + '</span><div class="tn-main"><span class="tn-k">Proposed round</span>' +
        '<span class="tn-when">' + T.shortDate(p.date) + ' · ' + slotLabel(p.slot) + '</span>' +
        '<div class="tn-chips">' + t.players.map(function (id) {
          var r = p.responses[id], cls = r === 'yes' ? 'yes' : r === 'no' ? 'no' : 'wait';
          return '<span class="tn-chip ' + cls + '">' + avatar(id, 'xs') + esc(nm(id)) + '<b>' + (r === 'yes' ? 'In' : r === 'no' ? 'Can’t' : 'Waiting') + '</b></span>';
        }).join('') + '</div>' +
        '<span class="tn-sub">' + (p.date < t.today ? 'That date has passed without everyone confirming. Withdraw it and pick another time.' : st.allIn ? 'All four are in — set the tee time once the course is booked.' : st.declined.length ? esc(listNames(st.declined.map(nm))) + ' can’t make it. Withdraw it and pick another time.' : st.confirmed.length + ' of ' + t.players.length + ' confirmed') + '</span></div>' +
        '<div class="tn-actions">' + (st.allIn ? '<button class="btn btn-primary" data-tee="schedule" data-id="' + p.id + '">' + ICON.check + 'Set tee time</button>'
          : me ? '<button class="btn ' + (mine === 'yes' ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-tee="respond" data-id="' + p.id + '" data-r="yes" aria-pressed="' + (mine === 'yes') + '">' + ICON.check + 'I’m in</button><button class="btn ' + (mine === 'no' ? 'btn-danger' : 'btn-ghost') + ' btn-sm" data-tee="respond" data-id="' + p.id + '" data-r="no" aria-pressed="' + (mine === 'no') + '">Can’t make it</button>'
          : '<span class="small muted">Pick your name below to reply</span>') +
        '<button class="btn-link" data-tee="withdraw" data-id="' + p.id + '">Withdraw</button></div></div>';
    } else if (t.best) {
      box = '<div class="tn-box best"><span class="tn-icon">' + ICON.flag + '</span><div class="tn-main"><span class="tn-k">Best next time</span>' +
        '<span class="tn-when">' + T.shortDate(t.best.date) + ' · ' + t.best.label + '</span><span class="tn-count">' + t.best.yes.length + '/' + t.players.length + ' available</span></div>' +
        '<div class="tn-actions"><button class="btn btn-primary" data-tee="propose" data-w="' + t.best.weekend + '" data-d="' + t.best.day + '" data-s="' + t.best.slot + '">Propose round</button></div></div>';
    } else {
      var b = t.blocker, alt = t.overlaps[0];
      box = '<div class="tn-box none"><span class="tn-icon">' + ICON.calendar + '</span><div class="tn-main"><span class="tn-k">No time works for all four yet</span>' +
        '<span class="tn-msg">' + (b.kind === 'waiting' ? waitingText(t) : 'Everyone’s answered, but there’s no time all four can make. Add two more weekends.') + '</span>' +
        (alt ? '<span class="tn-sub">Closest so far: ' + T.shortDate(alt.date) + ' · ' + alt.label + ' · ' + alt.yes.length + '/' + t.players.length + '</span>' : '') + '</div>' +
        (b.kind === 'no-overlap' && t.win.weeks < T.MAX_WEEKS ? '<div class="tn-actions"><button class="btn btn-primary btn-sm" data-tee="extend">' + ICON.plus + '2 more weekends</button></div>' : '') + '</div>';
    }
    return '<section class="card tee-next" aria-label="Next fixture"><div class="tn-top"><span class="tn-round">Round ' + pad2(f.round) + '</span>' +
      '<span class="tn-pair">' + esc(teamName(f.teamA)) + ' <i>v</i> ' + esc(teamName(f.teamB)) + '</span>' +
      '<span class="tn-last">' + (!t.last ? 'First round of the season' : t.last.kind === 'played' ? 'Last round: ' + T.shortDate(t.last.date) + ' (Round ' + pad2(t.last.round) + ')'
        : 'Previous round: ' + T.shortDate(t.last.date) + ' (Round ' + pad2(t.last.round) + ', ' + LOCK_WORD[t.last.kind] + ')') + '</span></div>' + box + '</section>';
  }

  /** "Waiting on Forrest to fill in availability." + who still has weekends left. */
  function waitingText(t) {
    var r = T.responses(t.o), none = r.filter(function (x) { return !x.answered; }).map(function (x) { return nm(x.id); });
    var part = r.filter(function (x) { return x.answered && !x.complete; }).map(function (x) { return nm(x.id); });
    if (none.length) return 'Waiting on ' + esc(listNames(none)) + ' to fill in availability.' + (part.length ? '<span class="tn-sub">' + esc(listNames(part)) + (part.length > 1 ? ' still have' : ' still has') + ' weekends to fill in.</span>' : '');
    return 'Waiting on ' + esc(listNames(part)) + ' to finish filling in availability.';
  }
  function saveBadge() {
    if (tee.error) return '<button class="tee-save err" data-tee="retry">' + ICON.alert + (tee.retries <= RETRY_SECONDS.length ? 'Not saved yet — retrying (tap to retry now)' : 'Not saved — tap to retry') + '</button>';
    if (tee.inflight || Object.keys(tee.pending).length) return '<span class="tee-save busy"><span class="spinner dark"></span>Saving…</span>';
    if (tee.savedAt) return '<span class="tee-save ok">' + ICON.check + 'Saved</span>';
    return '<span class="tee-save"></span>';
  }

  function teeAvailCard(t) {
    var me = t.players.indexOf(tee.player) !== -1 ? tee.player : null;
    var bestKey = t.best ? t.best.weekend + ':' + t.best.day + ':' + t.best.slot : '';
    var resp = {}; T.responses(t.o).forEach(function (r) { resp[r.id] = r; });
    var who = '<div class="tee-who"><span class="tee-editing">' + ICON.users + (me ? 'Editing: <b>' + esc(nm(me)) + '</b>' : 'Who are you?') + '</span>' +
      '<div class="tee-pick" role="radiogroup" aria-label="Whose availability">' + t.players.map(function (id) {
        return '<label class="tee-radio"><input type="radio" name="teeWho" value="' + id + '"' + (id === me ? ' checked' : '') + '><span class="dot"></span>' + esc(nm(id)) + '</label>';
      }).join('') + '</div></div>';
    var weeks = t.win.weekends.map(function (w, wi) {
      var mine = me ? t.o.avail[me][w] : undefined, answered = T.answered(mine);
      var isBest = bestKey.indexOf(w + ':') === 0;
      var head = '<div class="tw-head"><div class="tw-title"><span class="tw-k">Week ' + (wi + 1) + '</span><span class="tw-dates">' + T.weekendLabel(w) + '</span></div>' +
        '<div class="tw-who" aria-label="Who is free this weekend">' + t.players.map(function (id) {
          var a = id in t.o.avail && w in t.o.avail[id];
          // green once they've answered: at least one time ticked, or "Can't make it"
          var m = t.o.avail[id][w], ok = T.answered(m);
          var state_ = !ok ? ': no response yet' : T.declined(m) ? ' can’t make this weekend' : ' is free at least once';
          return '<button type="button" class="tw-av' + (ok ? ' in' : '') + (id === me ? ' me' : '') + '" data-tee="who" data-id="' + id + '" title="' + esc(nm(id)) + state_ + (id === me ? '' : ' — tap to edit') + '" aria-label="' + esc(nm(id)) + state_ + (id === me ? ' (editing)' : '. Tap to edit ' + esc(nm(id)) + '’s availability') + '" aria-pressed="' + (id === me) + '">' + avatar(id, 'xs') + '</button>';
        }).join('') + '</div>' +
        (me ? (function () {
          var allFree = answered && (mine & T.FULL_MASK) === T.FULL_MASK, cant = T.declined(mine);
          return '<div class="tw-actions"><button class="tw-bulk' + (allFree ? ' on' : '') + '" data-tee="week" data-w="' + w + '" data-v="all" aria-pressed="' + allFree + '">' + (allFree ? ICON.check : '') + 'Free all weekend</button>' +
            '<button class="tw-bulk' + (cant ? ' on no' : '') + '" data-tee="week" data-w="' + w + '" data-v="none" aria-pressed="' + cant + '">' + (cant ? ICON.close : '') + 'Can’t make it</button></div>';
        })() : '') +
        (me && !answered ? '<span class="tw-note">Not answered yet</span>' : me && T.declined(mine) ? '<span class="tw-note out">You can’t make this weekend</span>' : '') + '</div>';
      var grid = '<div class="tw-grid' + (me ? '' : ' group') + '"><span class="tw-corner"></span>' + T.DAYS.map(function (d, di) {
        var date = T.addDays(w, d.offset), past = date < t.today;
        return me && !past ? '<button class="tw-day" data-tee="day" data-w="' + w + '" data-d="' + di + '" title="Toggle all of ' + d.long + '">' + d.short + ' ' + (+date.slice(8)) + '</button>'
          : '<span class="tw-day' + (past ? ' past' : '') + '">' + d.short + ' ' + (+date.slice(8)) + '</span>';
      }).join('') + T.SLOTS.map(function (s, si) {
        return '<span class="tw-slot">' + s.label + '</span>' + T.DAYS.map(function (d, di) {
          var date = T.addDays(w, d.offset), past = date < t.today, key = w + ':' + di + ':' + si, lbl = d.long + ' ' + (+date.slice(8)) + ' ' + s.label;
          var star = key === bestKey ? ' best' : '';
          if (!me) {
            var n = t.players.filter(function (p) { return T.cellStatus(t.o.avail, p, w, di, si) === 'yes'; }).length;
            return '<span class="tw-cell count c' + n + star + (past ? ' past' : '') + '" data-w="' + w + '" data-d="' + di + '" data-s="' + si + '" title="' + lbl + ': ' + n + ' of ' + t.players.length + ' available">' + (n ? n + '/' + t.players.length : '–') + '</span>';
          }
          var on = answered && T.has(mine, di, si), cls = past ? 'past' : on ? 'yes' : answered ? 'no' : 'empty';
          return '<button class="tw-cell ' + cls + star + '" data-tee="cell" data-w="' + w + '" data-d="' + di + '" data-s="' + si + '" aria-pressed="' + on + '" aria-label="' + lbl + (on ? ': available' : ': not available') + '"' + (past ? ' disabled' : '') + '>' + (on ? ICON.check : '<i>–</i>') + '</button>';
        }).join('');
      }).join('') + '</div>';
      return '<div class="tee-week' + (isBest ? ' best' : '') + '">' + head + grid + '</div>';
    }).join('');
    return '<section class="card tee-avail" aria-labelledby="teeAvT"><div class="card-head"><h2 id="teeAvT">Availability</h2><span id="teeSave">' + saveBadge() + '</span></div>' + who +
      (me ? '' : '<p class="tee-hint">Pick your name to fill in your times. Until then you’re seeing how many are free for each slot.</p>') +
      '<div class="tee-weeks">' + weeks + '</div>' +
      '<div class="tee-foot"><span class="small muted">' + (me ? 'Tap to toggle. Green means available. Tap a day to fill the whole day.' : 'Numbers show how many of the four are free.') + '</span>' +
      (t.win.weeks < T.MAX_WEEKS ? '<button class="btn btn-ghost btn-sm" data-tee="extend">' + ICON.plus + 'Show 2 more weekends</button>' : '') + '</div></section>';
  }

  function teeOverlapCard(t) {
    var rows = t.overlaps.map(function (o) {
      var all = o.yes.length === t.players.length;
      var note = all ? 'Everyone’s free' : [o.no.length ? listNames(o.no.map(nm)) + ' can’t' : '', o.missing.length ? 'awaiting ' + listNames(o.missing.map(nm)) : ''].filter(Boolean).join(' · ');
      return '<button class="ov-row' + (all ? ' all' : '') + '" data-tee="propose" data-w="' + o.weekend + '" data-d="' + o.day + '" data-s="' + o.slot + '">' + ICON.flag +
        '<span class="ov-main"><span class="ov-when">' + T.shortDate(o.date) + ' · ' + o.label + ' · <b>' + o.yes.length + '/' + t.players.length + '</b></span><span class="ov-note">' + esc(note) + '</span></span>' + ICON.chevron + '</button>';
    }).join('');
    return '<section class="card tee-ov" aria-labelledby="teeOvT"><h2 id="teeOvT">Best overlaps</h2>' +
      (rows ? '<div class="ov-list">' + rows + '</div>' : '<p class="tee-hint" style="margin:10px 0 0">Nothing yet. As soon as two of you are free at the same time, it shows up here.</p>') + '</section>';
  }

  function teeFootnote(t) {
    var f = t.fixture, a = t.last, txt;
    if (!a) txt = 'First round of the season, so availability is open from this weekend.';
    else if (t.win.slid) txt = 'Availability opens three weeks after the previous round. Those weekends have passed, so the calendar starts from this weekend.';
    else if (a.kind === 'played') txt = 'Availability opens three weeks after the last round. Round ' + pad2(a.round) + ' was ' + T.shortDate(a.date) + ', so Round ' + pad2(f.round) + ' opens the weekend of ' + T.shortDate(t.win.start) + '.';
    else txt = 'Availability opens three weeks after the previous round. Round ' + pad2(a.round) + ' is locked in for ' + T.shortDate(a.date) + ', so Round ' + pad2(f.round) + ' opens the weekend of ' + T.shortDate(t.win.start) + '.';
    return '<p class="tee-note">' + ICON.info + '<span>' + txt + '</span></p>';
  }

  /* ---- saving availability: instant on screen, batched to the database ---- */
  function queueAvail(w, set, clear) {
    var me = tee.player; if (!me) return;
    var byP = tee.pending[me] = tee.pending[me] || {};
    var p = byP[w] || { s: 0, c: 0 };
    p.s = (p.s | set) & ~clear; p.c = (p.c | clear) & ~set;
    byP[w] = p; tee.error = ''; tee.retries = 0;
    persistPending();
    render();
    clearTimeout(tee.timer); tee.timer = setTimeout(flushAvail, 450);
  }
  /* Unsaved taps are also kept on the device, so closing the page or losing
     signal never throws them away: they're sent next time the page opens. */
  var PENDING_KEY = 'dd-tee-pending-' + MODE;
  function layered() {
    var out = {};
    [tee.inflight, tee.pending].forEach(function (layer) {
      if (!layer) return;
      Object.keys(layer).forEach(function (pid) {
        Object.keys(layer[pid]).forEach(function (w) {
          var nw = layer[pid][w], old = (out[pid] || {})[w];
          out[pid] = out[pid] || {};
          out[pid][w] = old ? { s: (old.s & ~nw.c) | nw.s, c: (old.c & ~nw.s) | nw.c } : { s: nw.s, c: nw.c };
        });
      });
    });
    return out;
  }
  function persistPending() {
    try {
      var all = layered();
      if (Object.keys(all).length) localStorage.setItem(PENDING_KEY, JSON.stringify(all)); else localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* storage unavailable: memory only */ }
  }
  function teeRestore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) {}
    if (!saved || typeof saved !== 'object') return;
    Object.keys(saved).forEach(function (pid) {
      if (!state.data.players.some(function (p) { return p.id === pid; })) return;
      Object.keys(saved[pid] || {}).forEach(function (w) {
        var ch = saved[pid][w];
        if (!T.isFriday(w) || !ch) return;
        tee.pending[pid] = tee.pending[pid] || {};
        tee.pending[pid][w] = { s: (ch.s | 0) & T.ALL_BITS, c: (ch.c | 0) & T.ALL_BITS };
      });
    });
    if (teeBusy()) flushAvail();
  }
  var RETRY_SECONDS = [2, 5, 10, 20, 30, 30, 60, 60];
  async function flushAvail() {
    clearTimeout(tee.timer);
    if (tee.inflight || !Object.keys(tee.pending).length) return;
    var batch = tee.pending; tee.pending = {}; tee.inflight = batch;
    try {
      for (var pid in batch) {
        var changes = Object.keys(batch[pid]).map(function (w) {
          var ch = batch[pid][w], saved = (state.data.availability.filter(function (a) { return a.playerId === pid && a.weekend === w; })[0] || {}).mask || 0;
          var c = ch.c, sb = ch.s;
          if (!(saved & T.DECLINED)) c &= ~T.DECLINED;            // nothing to clear: keeps ordinary ticks working on any database version
          if (tee.legacy) { sb &= ~T.DECLINED; c &= ~T.DECLINED; }
          return { w: w, s: sb, c: c };
        });
        for (var i = 0; i < changes.length; i += 30) {
          var rows = await state.store.setAvailability(pid, changes.slice(i, i + 30));
          (rows || []).forEach(function (r) {
            var hit = state.data.availability.filter(function (a) { return a.playerId === pid && a.weekend === r.w; })[0];
            if (hit) hit.mask = r.mask; else state.data.availability.push({ playerId: pid, weekend: r.w, mask: r.mask });
          });
          changes.slice(i, i + 30).forEach(function (ch) { delete batch[pid][ch.w]; });   // saved — no longer in flight
        }
      }
      tee.savedAt = Date.now(); tee.error = ''; tee.retries = 0; writeSeq++;
    } catch (e) {
      // database not yet updated for "Can't make it": fall back to the old behaviour rather than failing
      if (!tee.legacy && /Invalid availability change/.test(e.message || '') && Object.keys(batch).some(function (pid) { return Object.keys(batch[pid]).some(function (w) { return batch[pid][w].s & T.DECLINED; }); })) {
        tee.legacy = true;
        toast('“Can’t make it” needs the latest database update (run supabase-schema.sql in Supabase). Your other taps are fine.', 'error');
      }
      // keep everything that didn't save, with any newer taps taking precedence
      Object.keys(batch).forEach(function (pid) {
        Object.keys(batch[pid]).forEach(function (w) {
          var old = batch[pid][w], nw = (tee.pending[pid] || {})[w];
          tee.pending[pid] = tee.pending[pid] || {};
          tee.pending[pid][w] = nw ? { s: (old.s & ~nw.c) | nw.s, c: (old.c & ~nw.s) | nw.c } : old;
        });
      });
      tee.error = e.message || 'Could not save';
      tee.retries = (tee.retries || 0) + 1;
      if (tee.retries === 1) toast('Availability not saved yet (' + tee.error + '). Retrying automatically — your taps are kept.', 'error');
      clearTimeout(tee.timer);
      if (tee.retries <= RETRY_SECONDS.length) tee.timer = setTimeout(flushAvail, RETRY_SECONDS[tee.retries - 1] * 1000);
    }
    tee.inflight = null;
    persistPending();
    if (tee.legacy && tee.error && /Invalid availability change/.test(tee.error) && tee.retries === 1) { tee.error = ''; tee.retries = 0; clearTimeout(tee.timer); return flushAvail(); }
    if (Object.keys(tee.pending).length && !tee.error) return flushAvail();
    if (state.route && state.route.page === 'tee-time') render();
  }
  function teeBusy() { return !!(tee.inflight || Object.keys(tee.pending).length); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && teeBusy()) flushAvail(); });
  window.addEventListener('online', function () { if (teeBusy() && !tee.inflight) { tee.retries = 0; flushAvail(); } });
  window.addEventListener('pagehide', function () { if (teeBusy()) flushAvail(); });
  window.addEventListener('beforeunload', function () { if (teeBusy()) flushAvail(); });   // unsaved taps are kept on the device anyway

  function toastUndo(msg, undo) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = ICON.check + '<div>' + esc(msg) + '</div><button type="button" class="toast-undo">Undo</button>';
    $('#toasts').appendChild(el);
    var gone = false;
    function close() { if (gone) return; gone = true; el.classList.add('leaving'); setTimeout(function () { el.remove(); }, 320); }
    $('.toast-undo', el).onclick = function () { undo(); close(); };
    setTimeout(close, 6000);
  }

  /* ---- proposing and scheduling ---- */
  async function teeAct(promise, ok, btn) {
    if (btn) busy(btn, true, 'Saving…');
    try { await promise; writeSeq++; closeModal(); if (ok) toast(ok); await refresh(); return true; }
    catch (e) { if (btn) busy(btn, false); toast(e.message || 'Something went wrong.', 'error'); await refresh(); return false; }
  }
  function openPropose(w, di, si) {
    var t = teeCtx(); if (!t.fixture) return;
    if (t.proposal) { toast('Round ' + pad2(t.fixture.round) + ' already has a proposed date — withdraw it first to pick another.', 'error'); return; }
    var date = T.addDays(w, +di), c = T.overlaps(t.o).filter(function (x) { return x.weekend === w && x.day === +di && x.slot === +si; })[0];
    var yes = c ? c.yes : [], no = c ? c.no : [], missing = c ? c.missing : t.players;
    var me = t.players.indexOf(tee.player) !== -1 ? tee.player : null;
    openModal({
      title: 'Propose Round ' + pad2(t.fixture.round), sub: esc(teamName(t.fixture.teamA)) + ' v ' + esc(teamName(t.fixture.teamB)),
      body: '<div class="tn-box best" style="margin:0 0 14px"><span class="tn-icon">' + ICON.flag + '</span><div class="tn-main"><span class="tn-k">Proposed time</span><span class="tn-when">' + T.shortDate(date) + ' · ' + slotLabel(+si) + '</span><span class="tn-count">' + yes.length + '/' + t.players.length + ' available</span></div></div>' +
        (yes.length < t.players.length ? '<div class="callout">Not everyone is free: ' + esc([no.length ? listNames(no.map(nm)) + ' can’t make it' : '', missing.length ? listNames(missing.map(nm)) + ' hasn’t answered' : ''].filter(Boolean).join('; ')) + '. Everyone still has to confirm before it’s set.</div>' : '') +
        '<p style="margin:0">Each player confirms or declines. Once all four are in, set the tee time and course.' + (me ? ' You’ll be marked as in, ' + esc(nm(me)) + '.' : '') + '</p>',
      foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tpGo">' + ICON.flag + 'Propose round</button>',
      mount: function (m) { $('#tpGo', m).onclick = function () { teeAct(state.store.proposeRound({ fixtureId: t.fixture.id, date: date, slot: +si, playerId: me }), 'Round ' + pad2(t.fixture.round) + ' proposed for ' + T.shortDate(date) + '. Over to the others to confirm.', this); }; }
    });
  }
  function openSchedule(id) {
    var p = proposalById(id), f = fixtureById(p.fixtureId);
    openModal({
      title: (p.status === 'scheduled' ? 'Change' : 'Set') + ' tee time', sub: 'Round ' + pad2(f.round) + ' · ' + T.shortDate(p.date) + ' · ' + slotLabel(p.slot),
      body: HONEYPOT + '<div class="row-2 keep"><div class="field"><label for="tsTime">Tee-off time</label><input class="input" type="time" id="tsTime" value="' + esc(p.teeTime || T.SLOTS[p.slot].start) + '"></div>' +
        '<div class="field"><label for="tsCourse">Golf course</label><input class="input" id="tsCourse" list="courseList" maxlength="80" value="' + esc(p.course || f.course || '') + '" placeholder="e.g. Wembley Golf Course">' + courseDatalist() + '</div></div>' +
        '<div class="field-error" id="tsErr" role="alert"></div><p class="small muted" style="margin:0">This puts the round on the fixture list for everyone. Booking the course is still up to you.</p>',
      foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tsGo">' + ICON.check + 'Save</button>',
      mount: function (m) {
        $('#tsGo', m).onclick = function () {
          if (trapped(m)) { closeModal(); return; }
          var tt = $('#tsTime', m).value, course = $('#tsCourse', m).value.trim();
          if (!tt) { $('#tsErr', m).textContent = 'Enter the tee-off time.'; return; }
          if (!course) { $('#tsErr', m).textContent = 'Enter the golf course.'; return; }
          teeAct(state.store.scheduleFixture(p.id, { teeTime: tt, course: course }), 'Round ' + pad2(f.round) + ' set for ' + T.shortDate(p.date) + ', ' + time12(tt) + ' at ' + course + '.', this);
        };
      }
    });
  }

  document.addEventListener('change', function (e) {
    if (e.target.name !== 'teeWho') return;
    selectTeePlayer(e.target.value);
  });
  function selectTeePlayer(id) {
    if (id === tee.player) return;
    flushAvail();                                   // anything tapped for the previous person is still saved for them
    tee.player = id;
    try { localStorage.setItem(TEE_PLAYER_KEY, id); } catch (x) {}
    render();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tee]'); if (!b || !state.data || b.disabled) return;
    var a = b.dataset.tee, w = b.dataset.w;
    var mask = function () { return tee.player ? availMap()[tee.player][w] : undefined; };
    if (a === 'cell') {
      var bt = T.bit(+b.dataset.d, +b.dataset.s), m0 = mask();
      if (m0 !== undefined && (m0 & bt)) queueAvail(w, 0, bt); else queueAvail(w, bt, T.DECLINED);
    } else if (a === 'day') {
      var db = T.dayBits(+b.dataset.d), m1 = mask() || 0;
      if ((m1 & db) === db) queueAvail(w, 0, db); else queueAvail(w, db, T.DECLINED);
    } else if (a === 'week') {
      var before = mask() || 0, pid = tee.player, wk = w, key = pid + '|' + w, all = b.dataset.v === 'all';
      var isOn = all ? (before & T.FULL_MASK) === T.FULL_MASK : T.declined(before);
      if (isOn) {
        // tapped again: switch it off — back to how the weekend was before, or unanswered
        var prev = tee.bulkPrev[key];
        var back = prev !== undefined && !(all ? (prev & T.FULL_MASK) === T.FULL_MASK : T.declined(prev)) ? prev : 0;
        delete tee.bulkPrev[key];
        queueAvail(w, back, T.ALL_BITS & ~back);
        toast(T.answered(back) ? (all ? 'Free all weekend switched off — back to your earlier times.' : 'Can’t make it switched off — back to your earlier times.') : (all ? 'Free all weekend switched off.' : 'Can’t make it switched off.') + ' This weekend is unanswered again.');
      } else {
        tee.bulkPrev[key] = before;
        if (all) queueAvail(w, T.FULL_MASK, T.DECLINED); else queueAvail(w, T.DECLINED, T.FULL_MASK);
        if (T.answered(before)) toastUndo(all ? 'Whole weekend marked free. Tap it again to switch off.' : 'Marked as can’t make it. Tap it again to switch off.', function () {
          if (tee.player !== pid) return;
          delete tee.bulkPrev[key];
          queueAvail(wk, before, T.ALL_BITS & ~before);
        });
      }
    } else if (a === 'who') {
      selectTeePlayer(b.dataset.id);
      toast('Editing ' + nm(b.dataset.id) + '’s availability.');
    } else if (a === 'retry') { tee.error = ''; tee.retries = 0; flushAvail(); render(); }
    else if (a === 'extend') {
      var t = teeCtx(); if (!t.fixture) return;
      teeAct(state.store.extendWindow(t.fixture.id), 'Two more weekends added.', b);
    } else if (a === 'propose') openPropose(w, b.dataset.d, b.dataset.s);
    else if (a === 'respond') {
      if (!tee.player) { toast('Pick your name first.', 'error'); return; }
      teeAct(state.store.respondProposal(b.dataset.id, tee.player, b.dataset.r), b.dataset.r === 'yes' ? 'You’re in, ' + nm(tee.player) + '.' : 'Noted — ' + nm(tee.player) + ' can’t make it.', b);
    } else if (a === 'withdraw') {
      var p = proposalById(b.dataset.id);
      confirmDialog(p.status === 'scheduled' ? 'Cancel this tee time?' : 'Withdraw this proposal?', (p.status === 'scheduled' ? 'The round comes off the fixture list’s date and tee time. ' : '') + 'Everyone’s availability is kept, so you can propose another time straight away.', p.status === 'scheduled' ? 'Cancel tee time' : 'Withdraw', true)
        .then(function (ok) { if (ok) teeAct(state.store.withdrawProposal(p.id), p.status === 'scheduled' ? 'Tee time cancelled.' : 'Proposal withdrawn.'); });
    } else if (a === 'schedule') openSchedule(b.dataset.id);
    else if (a === 'record') openSubmit(b.dataset.id);
  });
  // Keep every page current with changes made on the other phones:
  // Tee Time checks every 15 seconds, other pages every 45.
  var lastCheck = Date.now();
  setInterval(function () {
    if (MODE !== 'live' || !state.route || document.visibilityState !== 'visible') return;
    if (teeBusy() || !$('#modalRoot').hidden) return;
    if (Date.now() - lastCheck < (state.route.page === 'tee-time' ? 15000 : 45000) - 500) return;
    lastCheck = Date.now();
    refresh(null, true);
  }, 5000);

  /* ------------------------------------------------------------------ QUICK ACTIONS (centre + button) */
  // Three shortcuts into the existing flows — nothing here records anything itself.
  function scheduleAction() {
    var c = ctx();
    if (state.data.tee && state.data.tee.ready === false) return { sub: 'Needs the latest database update', run: function () { goThen('#/tee-time'); } };
    if (!c.next) return { sub: 'Every round has been played', disabled: true };
    var t = teeCtx();
    // a round everyone has agreed to but without a tee time comes first
    var agreed = t.locked.filter(function (L) { return L.kind === 'agreed'; })[0];
    if (agreed) return { sub: 'Everyone’s in — set the tee time for Round ' + pad2(agreed.fixture.round), run: function () { goThen('#/tee-time', function () { openSchedule(agreed.proposal.id); }); } };
    if (!t.fixture) {
      var last = t.locked[t.locked.length - 1];
      return last && last.proposal ? { sub: 'Round ' + pad2(last.fixture.round) + ' is set for ' + T.shortDate(last.date) + ' — change it', run: function () { goThen('#/tee-time', function () { openSchedule(last.proposal.id); }); } }
        : { sub: 'Every remaining round has a date', run: function () { goThen('#/tee-time'); } };
    }
    var r = 'Round ' + pad2(t.fixture.round), p = t.proposal;
    if (p) {
      var st = T.proposalState(t.players, p.responses);
      return { sub: r + ' proposed for ' + T.shortDate(p.date) + ' · waiting on ' + listNames(st.waiting.concat(st.declined).map(nm)), run: function () { goThen('#/tee-time'); } };
    }
    if (t.best) { var b = t.best; return { sub: 'Propose ' + T.shortDate(b.date) + ' · ' + b.label + ' for ' + r + ' (4/4 free)', run: function () { goThen('#/tee-time', function () { openPropose(b.weekend, b.day, b.slot); }); } }; }
    return { sub: 'Fill in availability to find a date for ' + r, run: function () { goThen('#/tee-time'); } };
  }
  function openActions() {
    var c = ctx(), sch = scheduleAction(), plusBtn = $('.tab-submit');
    var items = [
      { id: 'record', icon: ICON.flag, title: 'Record Round', sub: c.next ? 'Enter the scores for Round ' + pad2(c.next.round) : 'Correct a result from Fixtures', run: function () { openSubmit(); } },
      { id: 'fine', icon: ICON.gavel, title: 'Add Fine', sub: 'Pick the offender and the offence', run: function () { openFine(); } },
      { id: 'schedule', icon: ICON.calendar, title: 'Schedule Fixture', sub: sch.sub, run: sch.run, disabled: sch.disabled }
    ];
    openModal({
      title: 'What’s happening?',
      body: '<div class="act-list">' + items.map(function (it) {
        return '<button type="button" class="act" data-act="' + it.id + '"' + (it.disabled ? ' disabled' : '') + '><span class="stat-icon">' + it.icon + '</span><span class="act-txt"><span class="act-t">' + it.title + '</span><span class="act-s">' + esc(it.sub) + '</span></span>' + ICON.chevron + '</button>';
      }).join('') + '</div>',
      mount: function (m) {
        m.classList.add('act-sheet');
        if (plusBtn) { plusBtn.setAttribute('aria-expanded', 'true'); }
        items.forEach(function (it) { var b = $('[data-act="' + it.id + '"]', m); if (b && !it.disabled) b.onclick = function () { closeModal(); it.run(); }; });
        if (window.innerWidth <= 700) { var first = $('.act', m); if (first) first.focus({ preventScroll: true }); }
      }
    });
    // reset the + icon when the sheet closes, however it closes
    var root = $('#modalRoot'), obs = new MutationObserver(function () { if (root.hidden || !$('.act-sheet', root)) { if (plusBtn) plusBtn.setAttribute('aria-expanded', 'false'); obs.disconnect(); } });
    obs.observe(root, { attributes: true, childList: true, subtree: false });
  }

  /* ------------------------------------------------------------------ routing & render */
  function parseRoute() {
    var h = (location.hash || '#/clubhouse').replace(/^#\/?/, '').split('/');
    var page = h[0] || 'clubhouse';
    if (['clubhouse', 'fixtures', 'tee-time', 'players', 'fines'].indexOf(page) === -1) page = 'clubhouse';
    return { page: page, id: h[1] || null };
  }
  function render(scrollTop) {
    if (!state.data) return;
    if (!season()) { app.innerHTML = '<div class="page container"><div class="card empty" style="margin:40px 0"><h4>No season found</h4><p>Run supabase-schema.sql in the Supabase SQL Editor to set up Season 01.</p></div></div>'; return; }
    destroyCharts();
    var r = state.route = parseRoute();
    var navKey = r.page === 'fines' ? 'players' : r.page;
    $$('[data-nav]').forEach(function (a) { var on = a.dataset.nav === navKey; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (r.page === 'clubhouse') renderClubhouse();
    else if (r.page === 'fixtures') renderFixtures();
    else if (r.page === 'players') { if (r.id) renderPlayer(r.id); else renderPlayers(); }
    else if (r.page === 'fines') renderFines();
    else if (r.page === 'tee-time') renderTeeTime();
    if (!scrollTop) { var pg = $('.page', app); if (pg) pg.style.animation = 'none'; }   // data refresh: no page-in animation
    var titles = { clubhouse: 'The Clubhouse', fixtures: 'Fixtures', 'tee-time': 'Tee Time', players: r.id ? nm(r.id) : 'Players', fines: 'Fines' };
    document.title = titles[r.page] + ' · Designated Drivers';
    if (scrollTop) window.scrollTo(0, 0);
  }

  /**
   * Reload shared data. `quiet` (background checks): redraw only if something
   * changed, never while a dialog is open or taps are still saving, and don't
   * nag with an error if the phone is briefly offline.
   */
  async function refresh(goTo, quiet) {
    try {
      var seq = writeSeq, data = await state.store.load();
      if (seq !== writeSeq) data = await state.store.load();   // something saved while loading: load again
      if (quiet) {
        if (JSON.stringify(data) === JSON.stringify(state.data)) return;
        if (!$('#modalRoot').hidden || teeBusy()) return;   // try again on the next check rather than redraw under someone
      }
      state.data = data;
      pickDefaultSeason(false);
      if (goTo && location.hash !== goTo) { location.hash = goTo; return; } // hashchange renders once
      render();
    } catch (e) { if (!quiet) toast('Could not load the latest data: ' + e.message, 'error'); }
  }
  function saveSeasonPref() { try { localStorage.setItem('dd-season-' + MODE, state.seasonId); } catch (e) {} }
  function pickDefaultSeason(force) {
    var ss = state.data.seasons;
    if (!force && state.seasonId && ss.some(function (s) { return s.id === state.seasonId; })) return;
    var pref = null; try { pref = localStorage.getItem('dd-season-' + MODE); } catch (e) {}
    if (!force && pref && ss.some(function (s) { return s.id === pref; })) { state.seasonId = pref; return; }
    var active = ss.filter(function (s) { return s.status === 'active'; }).sort(function (a, b) { return b.number - a.number; })[0];
    var latest = ss.slice().sort(function (a, b) { return b.number - a.number; })[0];
    state.seasonId = (active || latest || {}).id || null;
  }

  /* ------------------------------------------------------------------ global events */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action],[data-fixture],[data-href],[data-filter],[data-edit-fine],[data-del-fine],[data-toggle-paid],[data-edit-cat],[data-edit-bio]');
    if (!t || !state.data) return;
    if (t.closest('.modal') && !t.dataset.action) return;
    var a = t.dataset.action;
    if (a === 'submit-result') { e.preventDefault(); closeModal(); openSubmit(); }
    else if (a === 'actions') { e.preventDefault(); openActions(); }
    else if (a === 'reset-demo') { confirmDialog('Reset demo data?', 'This restores the fictional demo season in this browser.', 'Reset').then(function (ok) { if (ok) state.store.reset().then(function (d) { state.data = d; state.prevSeries = null; pickDefaultSeason(true); render(); toast('Demo data reset.'); }); }); }
    else if (a === 'add-fine') openFine();
    else if (a === 'add-category') openCategory();
    else if (t.dataset.fixture) openFixture(t.dataset.fixture);
    else if (t.dataset.href) location.hash = t.dataset.href;
    else if (t.dataset.filter) { state.fixtureFilter = t.dataset.filter; render(); }
    else if (t.dataset.editFine) openFine(t.dataset.editFine);
    else if (t.dataset.editCat) openCategory(t.dataset.editCat);
    else if (t.dataset.editBio) openBio(t.dataset.editBio);
    else if (t.dataset.togglePaid) {
      var f = state.data.fines.filter(function (x) { return x.id === t.dataset.togglePaid; })[0];
      t.disabled = true;
      state.store.setFinePaid(f.id, !f.paid).then(function () { toast(f.paid ? 'Marked as owing.' : nm(f.playerId) + ' has paid ' + money(f.amount) + '.'); return refresh(); }).catch(function (err) { t.disabled = false; toast(err.message, 'error'); });
    }
    else if (t.dataset.delFine) {
      var fd = state.data.fines.filter(function (x) { return x.id === t.dataset.delFine; })[0];
      confirmDialog('Remove this fine?', esc(nm(fd.playerId)) + ' — ' + esc(fd.categoryName) + ' (' + money(fd.amount) + '). This cannot be undone.', 'Remove fine', true).then(function (ok) {
        if (ok) state.store.deleteFine(fd.id).then(function () { toast('Fine removed. Clemency granted.'); return refresh(); }).catch(function (err) { toast(err.message, 'error'); });
      });
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-href]')) { e.preventDefault(); location.hash = e.target.dataset.href; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][data-fixture]')) { e.preventDefault(); openFixture(e.target.dataset.fixture); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'seasonSel') { state.seasonId = e.target.value; state.prevSeries = null; saveSeasonPref(); render(); }
  });
  window.addEventListener('hashchange', function () {
    closeModal(); render(true);
    if (state.afterNav) { var then = state.afterNav; state.afterNav = null; then(); }
    else if (MODE === 'live') { lastCheck = Date.now(); refresh(null, true); }   // show the page straight away, then pick up anyone else's changes
  });
  /** Go to a page, then run `then` once it has rendered (e.g. open a dialog there). */
  function goThen(hash, then) {
    closeModal();
    if (location.hash === hash) { if (then) then(); return; }
    state.afterNav = then || null;
    location.hash = hash;
  }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    if (MODE === 'live' && !window.supabase) {
      app.innerHTML = '<div class="container"><div class="card empty" style="margin:40px 0"><h4>Could not reach the database library</h4><p>The Supabase client failed to load. Check your connection and refresh.</p></div></div>';
      return;
    }
    state.store = MODE === 'live' ? new D.SupabaseStore(cfg) : new D.DemoStore();
    // Only ever used if the optional club code has been switched on in the database.
    state.store.askCode = function () { return Promise.resolve(window.prompt('This scoreboard is protected by a club code. Enter it once and this device will remember it.')); };
    if (MODE === 'demo') {
      var b = $('#demoBanner'); b.hidden = false;
      if (liveConfigured) b.innerHTML = '<strong>Demo mode</strong> (forced with ?demo) — fictional results in this browser only. <a href="' + location.pathname + '" style="font-weight:600">Open the real championship</a>';
    }
    try {
      state.data = await state.store.load();
      pickDefaultSeason(false);
      renderFooter();
      render(true);
      teeRestore();
      if (MODE === 'live') {
        var t; state.store.onChange(function () { clearTimeout(t); t = setTimeout(function () { refresh(null, true); }, 400); });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { lastCheck = Date.now(); refresh(null, true); } });
      }
    } catch (e) {
      app.innerHTML = '<div class="container"><div class="card empty" style="margin:40px 0"><div class="empty-icon">' + ICON.alert + '</div><h4>The clubhouse is closed</h4><p>' + esc(e.message) + '</p><p class="small">Check config.js and that supabase-schema.sql has been run. Preview with <a href="?demo">demo mode</a>.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>';
    }
  }
  boot();
})();
