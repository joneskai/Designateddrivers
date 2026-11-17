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

  var state = { data: null, store: null, session: null, seasonId: null, route: null, raceChart: null, charts: [], prevSeries: null, fixtureFilter: 'all', teeView: 'date', teeFixtureId: null };
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
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.500 9.7l5.9-.8z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4.2A8 8 0 1 1 8.400 19z"/><path d="M9.2 8.600c-.3 1 .2 2.500 1.600 3.900s2.900 1.900 3.900 1.600l.7-1.200-1.700-1-.8.700c-.6-.2-1.700-1.300-1.900-1.900l.7-.8-1-1.700z" fill="currentColor" stroke="none"/></svg>',
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
      nextPoll: next ? T.activePoll(state.data.polls, next.id) : null,
      latest: E.latestFixture(fx), fines: fines, finesSum: E.finesSummary(order, fines),
      row: function (id) { return table.filter(function (r) { return r.id === id; })[0]; }
    };
  }
  function seasonLabel(s) { return s ? (s.name || ('Season ' + pad2(s.number))) : 'Season'; }
  function isAdmin() { return MODE === 'demo' || !!(state.session && state.session.admin); }

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

  /* ------------------------------------------------------------------ auth */
  function openSignIn(then, need) {
    need = need || 'admin';
    if (MODE === 'demo') { if (then) then(); return; }
    openModal({
      title: 'Sign in', sub: need === 'player' ? 'Players sign in once on their phone to vote on the Tee Sheet.' : 'Organisers sign in to record results, fines and tee times. Players sign in to vote.',
      body: '<form id="signinForm" novalidate>' +
        '<div class="field"><label for="siEmail">Email</label><input class="input" id="siEmail" type="email" autocomplete="username" required></div>' +
        '<div class="field"><label for="siPw">Password</label><input class="input" id="siPw" type="password" autocomplete="current-password" required></div>' +
        '<div class="field-error" id="siErr" role="alert"></div><button type="submit" hidden></button></form>',
      foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="siGo">' + ICON.lock + 'Sign in</button>',
      mount: function (m) {
        var go = async function (e) {
          if (e) e.preventDefault();
          var email = $('#siEmail', m).value.trim(), pw = $('#siPw', m).value;
          if (!email || !pw) { $('#siErr', m).textContent = 'Enter your email and password.'; return; }
          var b = $('#siGo', m); busy(b, true, 'Signing in…');
          try {
            state.session = await state.store.signIn(email, pw);
            renderFooter();
            var okAdmin = state.session && state.session.admin, okPlayer = state.session && state.session.playerId;
            if (need === 'admin' && !okAdmin) { busy(b, false); render(); $('#siErr', m).textContent = 'Signed in' + (okPlayer ? ' as ' + nm(okPlayer) : '') + ', but this account is not an organiser. Ask the committee to add you to the administrators list (see README).'; return; }
            if (need === 'player' && !okPlayer) { busy(b, false); render(); $('#siErr', m).textContent = 'Signed in, but this login isn’t linked to a player yet. Ask an organiser to link it (see README).'; return; }
            closeModal(); toast(okPlayer ? 'Welcome back, ' + nm(okPlayer) + '.' : 'Welcome to the committee room, ' + email.split('@')[0] + '.');
            render();
            if (then) then();
          } catch (err) { busy(b, false); $('#siErr', m).textContent = err.message || 'Sign in failed.'; }
        };
        $('#signinForm', m).onsubmit = go; $('#siGo', m).onclick = go;
      }
    });
  }
  function requireAdmin(fn) {
    if (isAdmin()) return fn();
    if (state.session && !state.session.admin) { toast('This account is not an authorised administrator.', 'error'); return; }
    openSignIn(fn);
  }
  function renderFooter() {
    var el = $('#footerAuth');
    if (MODE === 'demo') { el.innerHTML = 'Demo mode · <button type="button" data-action="reset-demo">Reset demo data</button>'; return; }
    if (state.session) el.innerHTML = 'Signed in as ' + esc(state.session.email) + ' (' + [state.session.playerId ? esc(nm(state.session.playerId)) : '', state.session.admin ? 'organiser' : ''].filter(Boolean).join(' · ') + (!state.session.playerId && !state.session.admin ? 'read-only' : '') + ') · <button type="button" data-action="sign-out">Sign out</button>';
    else el.innerHTML = '<button type="button" data-action="sign-in">Player / committee sign in</button>';
  }

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
    var total = c.season.totalRounds || 12, n = c.next, poll = c.nextPoll;
    var label = n ? 'Next Round' : 'Status', main, sub = '';
    var link = '<a class="meta-link" href="#/tee-sheet">View Tee Sheet</a>';
    if (!n) main = ICON.trophy + '<span>Season complete</span>';
    else if (poll && poll.status === 'polling') {
      var pr = T.progress(poll, c.ids);
      label = 'Next Round — Scheduling';
      main = ICON.calendar + '<span>' + pr.count + ' / ' + pr.total + ' players responded</span>';
      sub = (pr.outstanding.length ? 'Awaiting ' + esc(listNames(pr.outstanding.map(nm))) : 'All in — ready to lock in a date') + ' · ' + link;
    } else if (poll && poll.status === 'agreed') {
      var as = poll.slots.filter(function (x) { return x.id === poll.agreedSlotId; })[0];
      label = 'Date Agreed';
      main = ICON.calendar + '<span>' + (as ? T.longDate(as.date) : 'Date agreed') + '</span>';
      sub = 'Booking pending. · ' + link;
    } else if (poll && poll.status === 'confirmed') {
      main = ICON.calendar + '<span>' + T.shortDate(poll.teeDate) + ' · ' + T.time12(poll.teeTime) + '</span>';
      sub = esc(poll.course) + ' · ' + link;
    } else {
      main = ICON.calendar + '<span>' + (n.date ? fmtDate(n.date) : 'Round ' + pad2(n.round) + ' · Date TBC') + (n.course ? ' · ' + esc(n.course) : (n.date ? ' · Course TBC' : '')) + '</span>';
      if (!n.date) sub = link;
    }
    return '<div class="hero-meta"><div class="meta-block center"><span class="meta-label">Round</span><span class="meta-big">' + pad2(c.done.length) + ' / ' + total + '</span></div>' +
      '<div class="meta-block"><span class="meta-label">' + label + '</span><div class="meta-next">' + main + '</div>' + (sub ? '<div class="meta-sub">' + sub + '</div>' : '') + '</div></div>';
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
      '<p class="visually-hidden">' + c.table.map(function (r) { return nm(r.id) + ' ' + r.points + ' points'; }).join(', ') + '</p></section>';
  }

  function standingsCard(c) {
    var rows = c.table.map(function (r, i) {
      var mv = c.movement[r.id] || 0;
      var mvHtml = mv > 0 ? '<span class="move up" title="Up ' + mv + '">' + ICON.up + mv + '</span>' : mv < 0 ? '<span class="move down" title="Down ' + (-mv) + '">' + ICON.down + (-mv) + '</span>' : '<span class="move same" aria-label="No change">–</span>';
      var leader = r.rank === 1 && r.points > 0;
      return '<tr class="' + (leader ? 'leader' : '') + '" data-href="#/players/' + r.id + '" tabindex="0" aria-label="' + esc(nm(r.id)) + ', ' + r.points + ' points — open profile">' +
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
    var leaderSub = leaders.length ? leaders[0].points + ' pts' + (leaders.length > 1 ? ' · shared' : '') : 'No rounds yet';
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
              label: function (it) { return ' ' + it.dataset.label + ': ' + it.parsed.y + ' pts'; }
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
    var poll = done ? null : pollFor(f.id), ag = poll && poll.status === 'agreed' ? agreedSlot(poll) : null;
    var status = done ? '<span class="badge done">' + (o.winner === 'DRAW' ? 'Halved' : 'Final') + '</span>'
      : poll && poll.status === 'confirmed' ? '<span class="badge done">Tee time confirmed</span>'
      : poll && poll.status === 'agreed' ? '<span class="badge next">Date agreed · booking pending</span>'
      : poll && poll.status === 'polling' ? '<span class="badge next">Finding a date</span>'
      : isNext ? '<span class="badge next">Up next</span>' : '<span class="badge">Scheduled</span>';
    var dateText = ag ? T.shortDate(ag.date) + ' · ' + T.windowLabel(ag) : fmtDate(f.date) + (!done && f.teeTime ? ' · ' + T.time12(f.teeTime) : '');
    var center = done ? '<div class="score-pill">' + f.scoreA + ' – ' + f.scoreB + '</div>' : '<div class="score-pill">vs</div>';
    var result = done ? (o.winner === 'DRAW' ? 'All square' : esc(teamName(o.winners)) + ' by ' + o.margin) : '';
    return '<button type="button" class="fixture ' + (done ? 'completed' : 'upcoming') + (isNext ? ' next' : '') + '" data-fixture="' + f.id + '" aria-label="Round ' + f.round + ' details">' +
      '<div class="fx-round"><span class="lbl">Round</span><span class="r">' + pad2(f.round) + '</span></div>' +
      '<div class="fx-team' + (o && o.winner === 'A' ? ' won' : '') + '">' + pair(f.teamA, 'sm') + '<span class="nm">' + esc(teamName(f.teamA)) + '</span></div>' +
      '<div class="fx-center">' + center + '</div>' +
      '<div class="fx-team right' + (o && o.winner === 'B' ? ' won' : '') + '"><span class="nm">' + esc(teamName(f.teamB)) + '</span>' + pair(f.teamB, 'sm') + '</div>' +
      '<div class="fx-meta"><div class="date">' + dateText + '</div><div class="course">' + esc(f.course || 'Course TBC') + '</div>' + (result ? '<div class="small muted">' + result + '</div>' : '') + status + '</div></button>';
  }

  function openFixture(id) {
    var f = fixtureById(id); if (!f) return;
    var done = E.isCompleted(f), o = done ? E.outcome(f) : null;
    var fines = state.data.fines.filter(function (x) { return x.fixtureId === f.id; });
    function team(t, side) {
      var won = o && o.winner === side;
      return '<div class="team">' + pair(t, 'lg') + '<span class="team-name">' + esc(teamName(t)) + '</span>' +
        (o ? '<span class="pts ' + (o.points[t[0]] ? 'plus' : '') + '">+' + o.points[t[0]] + ' pts each</span>' : '') + (won ? '<span class="badge done">Winners</span>' : '') + '</div>';
    }
    var body = '<div class="fixture-detail-teams">' + team(f.teamA, 'A') + (done ? '<div class="score-pill">' + f.scoreA + ' – ' + f.scoreB + '</div>' : '<div class="score-pill" style="background:transparent;color:var(--muted);border:1.5px dashed var(--line-2)">vs</div>') + team(f.teamB, 'B') + '</div>' +
      (done ? (o.winner === 'DRAW' ? '<div class="win-banner draw"><span class="trophy">' + ICON.balance + '</span><div><div class="t1">All square</div><div class="t2">Both teams on ' + f.scoreA + ' gross · +1 pt each</div></div></div>' : '<div class="win-banner"><span class="trophy">' + ICON.trophy + '</span><div><div class="t1">' + esc(teamName(o.winners)) + ' win</div><div class="t2">By ' + plural(o.margin, 'stroke') + ' · +2 pts each</div></div></div>') : '<div class="callout info">This round has not been played yet.</div>') +
      '<ul class="confirm-list" style="margin-top:14px"><li><span>Date</span><span>' + fmtDate(f.date, true) + '</span></li>' + (!done && f.teeTime ? '<li><span>Tee-off</span><span>' + T.time12(f.teeTime) + '</span></li>' : '') +
      (!done && pollFor(f.id) ? '<li><span>Tee Sheet</span><span><a href="#/tee-sheet" data-tee="focus" data-id="' + f.id + '">' + ({ polling: 'Finding a date', agreed: 'Date agreed · booking pending', confirmed: 'Tee time confirmed' }[pollFor(f.id).status]) + ' →</a></span></li>' : '') + '<li><span>Course</span><span>' + esc(f.course || 'TBC') + '</span></li><li><span>Format</span><span>2-person Ambrose · gross</span></li>' +
      (f.notes ? '<li><span>Notes</span><span>' + esc(f.notes) + '</span></li>' : '') + '</ul>' +
      (fines.length ? '<div class="section-label">Fines this round</div><ul class="confirm-list">' + fines.map(function (x) { return '<li><span>' + esc(nm(x.playerId)) + ' — ' + esc(x.categoryName) + '</span><span>' + money(x.amount) + '</span></li>'; }).join('') + '</ul>' : '');
    var foot = isAdmin()
      ? (done ? '<button class="btn btn-danger btn-sm spacer" id="fxDel">' + ICON.trash + 'Delete result</button>' : '<button class="btn btn-ghost btn-sm spacer" id="fxSwap">' + ICON.swap + 'Swap pairing</button>') +
        '<button class="btn btn-ghost" id="fxEdit">' + ICON.calendar + 'Date & course</button><button class="btn btn-primary" id="fxRes">' + (done ? ICON.edit + 'Edit result' : ICON.plus + 'Enter result') + '</button>'
      : '<button class="btn btn-ghost" data-close>Close</button>' + (MODE === 'live' && !state.session ? '<button class="btn btn-primary" id="fxSignIn">' + ICON.lock + 'Committee sign in</button>' : '');
    openModal({
      title: 'Round ' + pad2(f.round), sub: esc(seasonLabel(season())) + ' · ' + (done ? 'Completed' : 'Scheduled'), body: body, foot: foot,
      mount: function (m) {
        var b;
        if ((b = $('#fxRes', m))) b.onclick = function () { openSubmit(f.id); };
        if ((b = $('#fxEdit', m))) b.onclick = function () { openFixtureEdit(f.id); };
        if ((b = $('#fxSwap', m))) b.onclick = function () { openSwap(f.id); };
        if ((b = $('#fxSignIn', m))) b.onclick = function () { openSignIn(function () { openFixture(f.id); }); };
        if ((b = $('#fxDel', m))) b.onclick = async function () {
          var ok = await confirmDialog('Delete Round ' + pad2(f.round) + ' result?', 'The score will be removed and every standing, chart and record will be recalculated. Fines are kept.', 'Delete result', true);
          if (!ok) return;
          try { await state.store.deleteResult(f.id); toast('Round ' + pad2(f.round) + ' result deleted. Standings recalculated.'); await refresh(); } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  }

  function openFixtureEdit(id) {
    requireAdmin(function () {
      var f = fixtureById(id);
      var booked = pollFor(f.id);
      if (booked && booked.status === 'confirmed') { closeModal(); state.teeFixtureId = f.id; location.hash = '#/tee-sheet'; toast('This round has a confirmed tee time — use “Edit booking” on the Tee Sheet.'); return; }
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
    requireAdmin(function () {
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
  function openSubmit(fixtureId) {
    requireAdmin(function () {
      var s = season();
      if (!s) return toast('No active season.', 'error');
      var editing = fixtureId && E.isCompleted(fixtureById(fixtureId));
      var open = seasonFixtures().filter(function (f) { return !E.isCompleted(f); });
      if (!editing && !open.length) { toast('Every round of ' + seasonLabel(s) + ' has a result. Edit a round from the Fixtures page.', 'error'); return; }
      var form = { fixtureId: fixtureId || open[0].id, fines: [] };
      var f0 = fixtureById(form.fixtureId);
      form.date = f0.date && (editing || f0.date <= todayIso()) ? f0.date : todayIso();
      form.course = f0.course || ''; form.scoreA = editing ? f0.scoreA : ''; form.scoreB = editing ? f0.scoreB : ''; form.notes = editing ? f0.notes : '';
      var saving = false;

      function catOptions(sel) { return state.data.fineCategories.filter(function (c) { return c.active || c.id === sel; }).map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + ' (' + money(c.amount) + ')</option>'; }).join(''); }
      function playerOptions(sel) { return players().map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); }

      function preview(f) {
        var a = form.scoreA, b = form.scoreB;
        if (a === '' || b === '' || E.validateScores(a, b).length) return '<div class="preview" id="pv"><span class="muted">Enter both gross scores to see the result. Lowest gross wins.</span></div>';
        var fake = { teamA: f.teamA, teamB: f.teamB, scoreA: +a, scoreB: +b, status: 'completed' };
        var o = E.outcome(fake);
        var title = o.winner === 'DRAW' ? 'All square on ' + a + ' — a draw' : esc(teamName(o.winners)) + ' win by ' + plural(o.margin, 'stroke');
        return '<div class="preview ' + (o.winner === 'DRAW' ? '' : 'win') + '" id="pv"><div class="pv-title">' + title + '</div><div class="pv-points">' +
          f.teamA.concat(f.teamB).map(function (p) { return '<div>' + esc(nm(p)) + '<b class="' + (o.points[p] ? 'plus' : '') + '">+' + o.points[p] + '</b></div>'; }).join('') + '</div></div>';
      }
      function fineLines() {
        return form.fines.map(function (fl, i) {
          return '<div class="fine-line" data-i="' + i + '"><select class="input" data-fk="playerId" aria-label="Player">' + playerOptions(fl.playerId) + '</select>' +
            '<select class="input" data-fk="categoryId" aria-label="Offence">' + catOptions(fl.categoryId) + '</select>' +
            '<input class="input" data-fk="amount" type="number" min="0" step="0.5" inputmode="decimal" value="' + esc(fl.amount) + '" aria-label="Amount">' +
            '<button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remove fine">' + ICON.trash + '</button></div>';
        }).join('');
      }
      function drawForm() {
        var f = fixtureById(form.fixtureId);
        var o = (form.scoreA !== '' && form.scoreB !== '' && !E.validateScores(form.scoreA, form.scoreB).length) ? E.outcome({ teamA: f.teamA, teamB: f.teamB, scoreA: +form.scoreA, scoreB: +form.scoreB, status: 'completed' }) : null;
        var roundField = editing
          ? '<div class="field"><span class="lbl">Round</span><div class="input" style="display:flex;align-items:center;background:var(--card-2)">Round ' + pad2(f.round) + ' (editing recorded result)</div></div>'
          : '<div class="field"><label for="srRound">Round</label><select class="input" id="srRound">' + open.map(function (x) { return '<option value="' + x.id + '"' + (x.id === form.fixtureId ? ' selected' : '') + '>Round ' + pad2(x.round) + ' — ' + esc(teamName(x.teamA)) + ' v ' + esc(teamName(x.teamB)) + '</option>'; }).join('') + '</select></div>';
        modal.draw({
          title: editing ? 'Edit result' : 'Submit result', sub: esc(seasonLabel(s)) + ' · 2-person Ambrose · gross strokes',
          wide: true,
          body: (editing ? '<div class="callout">Editing an earlier result recalculates every standing, chart and record that follows it.</div>' : '') +
            '<form id="srForm" novalidate>' + roundField +
            '<div class="row-2"><div class="field"><label for="srDate">Date played</label><input class="input" type="date" id="srDate" value="' + esc(form.date) + '" max="' + todayIso() + '" required><div class="field-error" data-err="date"></div></div>' +
            '<div class="field"><label for="srCourse">Golf course</label><input class="input" id="srCourse" list="courseList" value="' + esc(form.course) + '" placeholder="e.g. Wembley Golf Course" required>' + courseDatalist() + '<div class="field-error" data-err="course"></div></div></div>' +
            '<div class="row-2 keep">' +
            ['A', 'B'].map(function (side) {
              var t = side === 'A' ? f.teamA : f.teamB;
              return '<div class="team-box' + (o && o.winner === side ? ' winner' : '') + '" id="tb' + side + '"><div class="tb-head"><span class="tb-tag">Team ' + side + '</span>' + pair(t, 'sm') + '</div><div class="tb-names">' + esc(teamName(t)) + '</div>' +
                '<div class="field" style="margin:10px 0 0"><label for="sr' + side + '">Gross strokes</label><input class="input score-input" id="sr' + side + '" type="number" inputmode="numeric" min="' + E.MIN_SCORE + '" max="' + E.MAX_SCORE + '" step="1" value="' + esc(side === 'A' ? form.scoreA : form.scoreB) + '" placeholder="—" required><div class="field-error" data-err="' + side + '"></div></div></div>';
            }).join('') + '</div>' +
            '<div style="margin-top:14px">' + preview(f) + '</div>' +
            '<div class="field"><label for="srNotes">Notes <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></label><textarea class="input" id="srNotes" placeholder="Shot of the day, conditions, excuses…">' + esc(form.notes || '') + '</textarea></div>' +
            (editing ? '' : '<div class="section-label"><span>Fines from this round <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></span><button type="button" class="btn btn-ghost btn-sm" id="srAddFine">' + ICON.plus + 'Add fine</button></div><div id="srFines">' + fineLines() + '</div>') +
            '</form>',
          foot: '<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="srNext">Review result ' + ICON.arrow + '</button>',
          mount: bindForm
        });
      }
      function bindForm(m) {
        var f = fixtureById(form.fixtureId);
        var rs = $('#srRound', m);
        if (rs) rs.onchange = function () { form.fixtureId = rs.value; var nf = fixtureById(rs.value); if (!form.course || form.course === f.course) form.course = nf.course || form.course; drawForm(); };
        $('#srDate', m).oninput = function () { form.date = this.value; };
        $('#srCourse', m).oninput = function () { form.course = this.value; };
        $('#srNotes', m).oninput = function () { form.notes = this.value; };
        ['A', 'B'].forEach(function (side) {
          $('#sr' + side, m).oninput = function () {
            form['score' + side] = this.value === '' ? '' : Number(this.value);
            var nf = fixtureById(form.fixtureId);
            $('#pv', m).outerHTML = preview(nf);
            var o = (form.scoreA !== '' && form.scoreB !== '' && !E.validateScores(form.scoreA, form.scoreB).length) ? E.outcome({ teamA: nf.teamA, teamB: nf.teamB, scoreA: +form.scoreA, scoreB: +form.scoreB, status: 'completed' }) : null;
            $('#tbA', m).classList.toggle('winner', !!o && o.winner === 'A'); $('#tbB', m).classList.toggle('winner', !!o && o.winner === 'B');
            this.classList.remove('invalid'); $('[data-err="' + side + '"]', m).textContent = '';
          };
        });
        var add = $('#srAddFine', m);
        if (add) add.onclick = function () {
          var cat = state.data.fineCategories.filter(function (c) { return c.active; })[0];
          if (!cat) { toast('Add a fine category on the Fines page first.', 'error'); return; }
          form.fines.push({ playerId: ids()[0], categoryId: cat.id, amount: cat.amount }); $('#srFines', m).innerHTML = fineLines();
        };
        var fl = $('#srFines', m);
        if (fl) {
          fl.oninput = fl.onchange = function (e) {
            var line = e.target.closest('.fine-line'); if (!line) return;
            var i = +line.dataset.i, k = e.target.dataset.fk; if (!k) return;
            form.fines[i][k] = k === 'amount' ? e.target.value : e.target.value;
            if (k === 'categoryId' && e.type === 'change') { var c = catById(e.target.value); form.fines[i].amount = c.amount; $('[data-fk="amount"]', line).value = c.amount; }
          };
          fl.onclick = function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; form.fines.splice(+b.dataset.rm, 1); fl.innerHTML = fineLines(); };
        }
        $('#srNext', m).onclick = function () { if (validate(m)) drawConfirm(); };
        $('#srForm', m).onsubmit = function (e) { e.preventDefault(); };
      }
      function validate(m) {
        var ok = true;
        function err(k, msg, input) { ok = false; $('[data-err="' + k + '"]', m).textContent = msg; if (input) input.classList.add('invalid'); }
        $$('.field-error', m).forEach(function (x) { x.textContent = ''; }); $$('.invalid', m).forEach(function (x) { x.classList.remove('invalid'); });
        if (!form.date) err('date', 'Choose the date the round was played.', $('#srDate', m));
        else if (form.date > todayIso()) err('date', 'A result cannot be recorded for a future date.', $('#srDate', m));
        if (!String(form.course || '').trim()) err('course', 'Enter the golf course.', $('#srCourse', m));
        ['A', 'B'].forEach(function (side) {
          var v = form['score' + side];
          var e2 = E.validateScores(v, 72);
          if (v === '' || e2.length) err(side, v === '' ? 'Required.' : 'Whole number between ' + E.MIN_SCORE + ' and ' + E.MAX_SCORE + '.', $('#sr' + side, m));
        });
        form.fines.forEach(function (x) { if (!(Number(x.amount) >= 0) || x.amount === '') { ok = false; toast('Each fine needs a valid amount.', 'error'); } });
        var dup = !editing && E.isCompleted(fixtureById(form.fixtureId));
        if (dup) { ok = false; toast('That round already has a result.', 'error'); }
        if (!ok) { var first = $('.invalid', m); if (first) first.focus(); }
        return ok;
      }
      function drawConfirm() {
        var f = fixtureById(form.fixtureId);
        var o = E.outcome({ teamA: f.teamA, teamB: f.teamB, scoreA: +form.scoreA, scoreB: +form.scoreB, status: 'completed' });
        modal.draw({
          title: 'Confirm result', sub: 'Check everything — this updates the championship for everyone.', wide: true,
          body: '<div class="fixture-detail-teams"><div class="team">' + pair(f.teamA, 'lg') + '<span class="team-name">' + esc(teamName(f.teamA)) + '</span></div><div class="score-pill">' + form.scoreA + ' – ' + form.scoreB + '</div><div class="team">' + pair(f.teamB, 'lg') + '<span class="team-name">' + esc(teamName(f.teamB)) + '</span></div></div>' +
            (o.winner === 'DRAW' ? '<div class="win-banner draw"><span class="trophy">' + ICON.balance + '</span><div><div class="t1">All square</div><div class="t2">+1 pt each</div></div></div>' : '<div class="win-banner"><span class="trophy">' + ICON.trophy + '</span><div><div class="t1">' + esc(teamName(o.winners)) + ' win</div><div class="t2">By ' + plural(o.margin, 'stroke') + ' · +2 pts each</div></div></div>') +
            '<ul class="confirm-list" style="margin-top:14px"><li><span>Round</span><span>' + pad2(f.round) + ' of ' + (season().totalRounds || 12) + '</span></li><li><span>Date</span><span>' + fmtDate(form.date, true) + '</span></li><li><span>Course</span><span>' + esc(form.course) + '</span></li>' +
            f.teamA.concat(f.teamB).map(function (p) { return '<li><span>' + esc(nm(p)) + '</span><span>+' + o.points[p] + ' pts</span></li>'; }).join('') +
            (form.notes ? '<li><span>Notes</span><span>' + esc(form.notes) + '</span></li>' : '') +
            (form.fines.length ? form.fines.map(function (x) { return '<li><span>Fine · ' + esc(nm(x.playerId)) + '</span><span>' + esc(catById(x.categoryId).name) + ' · ' + money(x.amount) + '</span></li>'; }).join('') : '') + '</ul>' +
            (MODE === 'demo' ? '<div class="callout" style="margin-top:14px">Demo mode: this is saved only in this browser.</div>' : ''),
          foot: '<button type="button" class="btn btn-ghost spacer" id="srBack">' + ICON.back + 'Back</button><button type="button" class="btn btn-primary" id="srSave">' + ICON.check + 'Confirm & save</button>',
          mount: function (m) {
            $('#srBack', m).onclick = drawForm;
            $('#srSave', m).onclick = async function () {
              if (saving) return; saving = true; var b = this; busy(b, true);
              try {
                await state.store.saveResult({ fixtureId: f.id, date: form.date, course: form.course.trim(), scoreA: +form.scoreA, scoreB: +form.scoreB, notes: (form.notes || '').trim(), mode: editing ? 'update' : 'create' });
                if (form.fines.length) {
                  try { await state.store.addFines(form.fines.map(function (x) { return { seasonId: f.seasonId, playerId: x.playerId, categoryId: x.categoryId, fixtureId: f.id, amount: Number(x.amount), notes: '' }; })); }
                  catch (e) { toast('Result saved, but fines failed: ' + e.message, 'error'); }
                }
                closeModal();
                toast(o.winner === 'DRAW' ? 'Round ' + pad2(f.round) + ' saved — all square.' : 'Round ' + pad2(f.round) + ' saved — ' + teamName(o.winners) + ' win by ' + o.margin + '.');
                await refresh('#/clubhouse');
              } catch (e) { saving = false; busy(b, false); toast(e.message || 'Could not save the result.', 'error'); }
            };
          }
        });
      }
      var modal = openModal({ title: 'Submit result', body: '', wide: true });
      drawForm();
    });
  }

  /* ------------------------------------------------------------------ PLAYERS */
  function renderPlayers() {
    var c = ctx();
    var cards = c.table.slice().sort(function (a, b) { return c.ids.indexOf(a.id) - c.ids.indexOf(b.id); }).map(function (r) {
      var p = P(r.id);
      return '<a class="card player-card" href="#/players/' + r.id + '" style="--pc:' + p.color + '">' + avatar(r.id) +
        '<span class="pos">' + (r.played ? ordinal(r.rank) + (r.shared ? ' (shared)' : '') : 'Yet to tee off') + '</span><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="pts"><strong>' + r.points + '</strong> pts</span>' +
        '<span class="rec"><span class="rec-pill">' + r.wins + 'W</span><span class="rec-pill">' + r.draws + 'D</span><span class="rec-pill">' + r.losses + 'L</span></span>' +
        '<span style="margin-top:10px">' + formHtml(r.form) + '</span></a>';
    }).join('');
    app.innerHTML = '<div class="page container">' + hero('The Field', 'Four golfers. Twelve rounds. One championship.', roundMeta(c)) +
      '<div class="grid grid-4 players-grid">' + cards + '</div></div>';
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
      '<div class="hero-tags"><span class="tag">' + r.points + ' pts</span><span class="tag">' + r.wins + 'W · ' + r.draws + 'D · ' + r.losses + 'L</span><span class="tag">Stroke diff ' + (r.diff > 0 ? '+' : '') + r.diff + '</span></div></div></section>' +
      '<div class="card" style="margin-bottom:18px"><div class="kpis">' +
      kpi('Position', r.played ? ordinal(r.rank) : '—', r.shared ? 'Shared' : 'of 4') + kpi('Points', r.points, 'Max ' + (2 * (c.season.totalRounds || 12))) + kpi('Played', r.played, (c.season.totalRounds || 12) - r.played + ' to play') + kpi('Win rate', pct(r.winPct), r.wins + 'W ' + r.draws + 'D ' + r.losses + 'L') +
      kpi('Avg team gross', num1(r.avgGross), 'Ambrose, per round') + kpi('Best team gross', r.best == null ? '—' : r.best, 'Lowest') + kpi('Worst team gross', r.worst == null ? '—' : r.worst, 'Highest') + '<div class="kpi"><div class="k">Current form</div><div style="margin-top:8px">' + formHtml(r.form) + '</div></div>' +
      '</div></div>' +
      '<div class="grid grid-2"><section class="card chart-card"><h2>Points Progression</h2><p class="card-sub">Cumulative points by round, against the field</p><div class="mini-chart"><canvas id="pChart" role="img" aria-label="' + esc(p.name) + ' cumulative points"></canvas></div></section>' +
      '<section class="card"><h2>Partner Chemistry</h2><p class="card-sub">Team results with each playing partner</p><div class="chem" style="margin-top:14px;grid-template-columns:minmax(0,1fr)">' + chem.map(function (x) {
        var tot = x.played || 1;
        return '<div class="chem-card"><div class="chem-head">' + pair([id, x.partner], 'sm') + '<div><div class="nm">with ' + esc(nm(x.partner)) + '</div><div class="sub">' + plural(x.played, 'round') + ' together · ' + x.points + ' pts</div></div><div style="margin-left:auto;font-family:var(--serif);font-size:22px;font-weight:600">' + pct(x.winPct) + '</div></div>' +
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
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#062E20', itemSort: function (a, b) { return b.parsed.y - a.parsed.y; }, callbacks: { label: function (it) { return ' ' + it.dataset.label + ': ' + it.parsed.y + ' pts'; } } } }
      }
    });
    state.charts.push(ch);
  }

  /* ------------------------------------------------------------------ FINES */
  function renderFines() {
    var c = ctx(), fs = c.finesSum, admin = isAdmin();
    var maxTot = Math.max.apply(null, fs.rows.map(function (r) { return r.total; }).concat([1]));
    var off = fs.topOffenders;
    var hist = c.fines.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var cats = state.data.fineCategories.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    app.innerHTML = '<div class="page container">' + hero('The Disciplinary Committee', 'Justice is swift, fair and payable in cash. Fines fund the end-of-season dinner and have no bearing on championship points.', '') +
      (admin ? '<div class="toolbar"><span></span><div class="btn-row"><button class="btn btn-cream" data-action="add-category">' + ICON.plus + 'New offence</button><button class="btn btn-gold" data-action="add-fine">' + ICON.gavel + 'Issue a fine</button></div></div>' : '') +
      '<div class="grid grid-4 fines-hero-stats">' +
      '<div class="card stat" style="border:0">' + '<span class="stat-icon">' + ICON.coins + '</span><span class="stat-body"><span class="stat-label">Total fines pot</span><div class="stat-value">' + money(fs.total) + '</div><div class="stat-sub">' + plural(fs.count, 'offence') + '</div></span></div>' +
      '<div class="card stat" style="border:0"><span class="stat-icon">' + ICON.check + '</span><span class="stat-body"><span class="stat-label">Paid</span><div class="stat-value">' + money(fs.paid) + '</div><div class="stat-sub">Settled with the treasurer</div></span></div>' +
      '<div class="card stat" style="border:0"><span class="stat-icon">' + ICON.alert + '</span><span class="stat-body"><span class="stat-label">Outstanding</span><div class="stat-value">' + money(fs.outstanding) + '</div><div class="stat-sub">The Committee is watching</div></span></div>' +
      '<div class="card stat" style="border:0"><span class="stat-icon">' + ICON.gavel + '</span><span class="stat-body"><span class="stat-label">Most fined</span><div class="stat-value' + (off.length > 1 ? ' sm' : '') + '">' + (off.length ? esc(listNames(off.map(function (r) { return nm(r.id); }))) : '—') + '</div><div class="stat-sub">' + (off.length ? money(off[0].total) + (off.length > 1 ? ' each' : '') : 'No offenders yet') + '</div></span></div></div>' +
      '<div class="grid grid-race"><section class="card"><h2>Offence Register</h2><p class="card-sub">Every charge laid before the Committee this season</p>' +
      (hist.length ? '<div class="table-wrap"><table class="data-table" style="margin-top:12px"><thead><tr><th>Offender</th><th>Offence</th><th class="hide-sm">Round</th><th class="num">Amount</th><th>Status</th>' + (admin ? '<th class="num"><span class="visually-hidden">Actions</span></th>' : '') + '</tr></thead><tbody>' +
        hist.map(function (f) {
          var fx = fixtureById(f.fixtureId);
          return '<tr><td><span class="inline-player">' + avatar(f.playerId, 'xs') + esc(nm(f.playerId)) + '</span></td><td>' + esc(f.categoryName) + (f.notes ? '<div class="small muted">' + esc(f.notes) + '</div>' : '') + '</td><td class="hide-sm">' + (fx ? 'R' + pad2(fx.round) : '—') + '</td><td class="num"><b>' + money(f.amount) + '</b></td>' +
            '<td>' + (admin ? '<button class="badge ' + (f.paid ? 'paid' : 'unpaid') + '" style="margin:0;border:0;cursor:pointer" data-toggle-paid="' + f.id + '" title="Toggle paid">' + (f.paid ? 'Paid' : 'Owing') + '</button>' : '<span class="badge ' + (f.paid ? 'paid' : 'unpaid') + '" style="margin:0">' + (f.paid ? 'Paid' : 'Owing') + '</span>') + '</td>' +
            (admin ? '<td class="num"><div class="fine-row-actions"><button class="icon-btn" data-edit-fine="' + f.id + '" aria-label="Edit fine">' + ICON.edit + '</button><button class="icon-btn" data-del-fine="' + f.id + '" aria-label="Delete fine">' + ICON.trash + '</button></div></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty"><div class="empty-icon">' + ICON.gavel + '</div><h4>The register is clean</h4><p>No offences have been recorded. The Committee finds this deeply suspicious.</p>' + (admin ? '<button class="btn btn-primary" data-action="add-fine">' + ICON.plus + 'Issue the first fine</button>' : '') + '</div>') +
      '</section><section class="card"><h2>Rogues’ Gallery</h2><p class="card-sub">Individual fines leaderboard</p><div style="margin-top:8px">' +
      fs.rows.map(function (r, i) { return '<div class="lb-row"><span class="rank-num">' + (i + 1) + '</span><div><span class="inline-player">' + avatar(r.id, 'sm') + esc(nm(r.id)) + '</span><div class="lb-bar"><i style="width:' + (r.total / maxTot * 100) + '%"></i></div></div><div class="lb-amt">' + money(r.total) + '<small>' + plural(r.count, 'offence') + (r.outstanding ? ' · ' + money(r.outstanding) + ' owing' : '') + '</small></div></div>'; }).join('') +
      '</div><p class="committee-quote">“Ignorance of the tariff is no defence.”</p></section></div>' +
      '<section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>Tariff of Penalties</h2><p class="card-sub">Standard fines. The Committee may adjust any amount at its discretion.</p></div></div><div class="tariff" style="margin-top:10px">' +
      cats.map(function (k) { return '<div class="tariff-item' + (k.active ? '' : ' inactive') + '"><span>' + esc(k.name) + '</span><span style="display:flex;gap:8px;align-items:center"><span class="amt">' + money(k.amount) + '</span>' + (admin ? '<button class="icon-btn" data-edit-cat="' + k.id + '" aria-label="Edit ' + esc(k.name) + '">' + ICON.edit + '</button>' : '') + '</span></div>'; }).join('') +
      '</div></section></div>';
  }

  function openFine(fineId, defaults) {
    requireAdmin(function () {
      var f = fineId ? state.data.fines.filter(function (x) { return x.id === fineId; })[0] : null;
      var cats = state.data.fineCategories.filter(function (c) { return c.active || (f && c.id === f.categoryId); });
      if (!cats.length) { toast('Create a fine category first.', 'error'); return; }
      var d = f || Object.assign({ playerId: ids()[0], categoryId: cats[0].id, amount: cats[0].amount, fixtureId: '', notes: '', paid: false }, defaults || {});
      var fx = seasonFixtures();
      openModal({
        title: f ? 'Amend fine' : 'Issue a fine', sub: 'The Committee’s decision is final (but editable).',
        body: '<div class="row-2"><div class="field"><label for="fnP">Offender</label><select class="input" id="fnP">' + players().map(function (p) { return '<option value="' + p.id + '"' + (p.id === d.playerId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="fnC">Offence</label><select class="input" id="fnC">' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === d.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div></div>' +
          '<div class="row-2"><div class="field"><label for="fnR">Round</label><select class="input" id="fnR"><option value="">Not tied to a round</option>' + fx.map(function (x) { return '<option value="' + x.id + '"' + (x.id === d.fixtureId ? ' selected' : '') + '>Round ' + pad2(x.round) + (x.date ? ' · ' + fmtDate(x.date) : '') + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="fnA">Amount ($)</label><input class="input" id="fnA" type="number" min="0" step="0.5" inputmode="decimal" value="' + esc(d.amount) + '"><div class="field-error" id="fnAErr"></div></div></div>' +
          '<div class="field"><label for="fnN">Notes</label><textarea class="input" id="fnN" placeholder="Evidence for the prosecution…">' + esc(d.notes || '') + '</textarea></div>' +
          '<label class="check"><input type="checkbox" id="fnPaid"' + (d.paid ? ' checked' : '') + '> Paid to the treasurer</label>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="fnSave">' + (f ? 'Save changes' : 'Issue fine') + '</button>',
        mount: function (m) {
          $('#fnC', m).onchange = function () { $('#fnA', m).value = catById(this.value).amount; };
          $('#fnSave', m).onclick = async function () {
            var amt = $('#fnA', m).value;
            if (amt === '' || !(Number(amt) >= 0)) { $('#fnAErr', m).textContent = 'Enter a valid amount.'; $('#fnA', m).classList.add('invalid'); return; }
            var payload = { playerId: $('#fnP', m).value, categoryId: $('#fnC', m).value, fixtureId: $('#fnR', m).value || null, amount: Number(amt), notes: $('#fnN', m).value.trim(), paid: $('#fnPaid', m).checked };
            var b = this; busy(b, true);
            try {
              if (f) await state.store.updateFine(f.id, payload);
              else await state.store.addFines([Object.assign({ seasonId: state.seasonId }, payload)]);
              closeModal(); toast(f ? 'Fine amended.' : nm(payload.playerId) + ' fined ' + money(payload.amount) + '. The Committee thanks you.'); await refresh();
            } catch (e) { busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }
  function openCategory(catId) {
    requireAdmin(function () {
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
            var dupe = state.data.fineCategories.some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!c || x.id !== c.id); });
            if (dupe) { $('#ctErr', m).textContent = 'That offence already exists.'; return; }
            var b = this; busy(b, true);
            try { await state.store.saveCategory({ id: c && c.id, name: name, amount: Number(amt), active: c ? $('#ctActive', m).checked : true }); closeModal(); toast('Tariff updated.'); await refresh(); }
            catch (e) { busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }

  /* ------------------------------------------------------------------ RECORDS */
  function renderRecords() {
    var order = ids();
    var seasons = state.data.seasons.slice().sort(function (a, b) { return a.number - b.number; });
    var rec = E.records(order, seasons.map(function (s) { return { season: s, fixtures: seasonFixtures(s.id), fines: seasonFines(s.id), complete: s.status === 'completed' }; }));
    var multi = seasons.length > 1;
    function sl(s) { return multi ? seasonLabel(s) + ' · ' : ''; }
    function names(list, fn) { return esc(listNames(list.map(fn))); }
    function honour(title, list, holder, value, ctxFn) {
      if (!list || !list.length) return '<div class="honour empty-honour"><span class="title">' + title + '</span><span class="holder">Awaiting a worthy holder</span><span class="value"></span></div>';
      return '<div class="honour"><span class="title">' + title + (list.length > 1 ? ' · shared' : '') + '</span><span class="holder">' + holder(list) + '</span><span class="value">' + value(list[0]) + '</span>' + (ctxFn ? '<span class="ctx">' + ctxFn(list) + '</span>' : '') + '</div>';
    }
    function uniq(arr) { return arr.filter(function (v, i, x) { return x.indexOf(v) === i; }); }
    function pairName(pr) { return teamName(pr.slice().sort(function (x, y) { return order.indexOf(x) - order.indexOf(y); })); }
    function fxCtx(list) { return list.slice(0, 3).map(function (x) { return sl(x.season) + 'Round ' + pad2(x.fixture.round) + (x.fixture.course ? ' · ' + esc(x.fixture.course) : ''); }).join(' / '); }
    var board =
      honour('Most championship points (season)', rec.mostPoints, function (l) { return names(l, function (x) { return nm(x.row.id); }); }, function (x) { return x.row.points + ' pts'; }, function (l) { return l.map(function (x) { return esc(seasonLabel(x.season)); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '); }) +
      honour('Most victories (season)', rec.mostWins, function (l) { return names(l, function (x) { return nm(x.row.id); }); }, function (x) { return plural(x.row.wins, 'win'); }, function (l) { return l.map(function (x) { return esc(seasonLabel(x.season)); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '); }) +
      honour('Longest winning streak', rec.longestStreak, function (l) { return names(l, function (x) { return nm(x.row.id); }); }, function (x) { return plural(x.row.bestStreak, 'round'); }, function (l) { return l.map(function (x) { return esc(seasonLabel(x.season)); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '); }) +
      honour('Lowest team gross', rec.lowestGross, function (l) { return uniq(l.map(function (x) { return esc(teamName(x.team)); })).join(' / '); }, function (x) { return x.score; }, fxCtx) +
      honour('Highest team gross', rec.highestGross, function (l) { return uniq(l.map(function (x) { return esc(teamName(x.team)); })).join(' / '); }, function (x) { return x.score; }, fxCtx) +
      honour('Biggest winning margin', rec.biggestMargin, function (l) { return uniq(l.map(function (x) { return esc(teamName(x.o.winners)); })).join(' / '); }, function (x) { return plural(x.o.margin, 'stroke'); }, fxCtx) +
      honour('Best partnership', rec.bestPartnership, function (l) { return l.map(function (x) { return esc(pairName(x.pair)); }).join(' / '); }, function (x) { return pct(x.winPct); }, function (l) { var x = l[0]; return x.wins + 'W ' + x.draws + 'D ' + x.losses + 'L from ' + plural(x.played, 'round') + ' · avg ' + num1(x.avgGross); }) +
      honour('Worst partnership', rec.worstPartnership, function (l) { return l.map(function (x) { return esc(pairName(x.pair)); }).join(' / '); }, function (x) { return pct(x.winPct); }, function (l) { var x = l[0]; return x.wins + 'W ' + x.draws + 'D ' + x.losses + 'L from ' + plural(x.played, 'round') + ' · avg ' + num1(x.avgGross); }) +
      honour('Most fines (all time)', rec.mostFines, function (l) { return names(l, function (x) { return nm(x.id); }); }, function (x) { return money(x.total); }, function (l) { return plural(l[0].count, 'offence') + (l.length > 1 ? ' each' : ''); }) +
      honour('Most championship titles', rec.mostTitles, function (l) { return names(l, function (x) { return nm(x.id); }); }, function (x) { return plural(x.titles, 'title'); });
    var cur = seasons.filter(function (s) { return s.status !== 'completed'; });
    var hall = rec.hall.slice().reverse().map(function (h) {
      return '<div class="hall-row"><div class="yr">' + esc(seasonLabel(h.season)) + '<small>' + (h.season.year || '') + '</small></div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        (h.champions.length ? h.champions.map(function (id) { return '<span class="inline-player">' + avatar(id, 'sm') + '<span style="font-family:var(--serif);font-size:20px">' + esc(nm(id)) + '</span></span>'; }).join('<span class="muted">&amp;</span>') : '<span class="muted">Not all rounds recorded</span>') + '</div>' +
        '<div style="color:var(--gold-deep)">' + ICON.trophy.replace('<svg', '<svg width="28" height="28"') + '</div></div>';
    }).join('') + cur.map(function (s) {
      var t = E.standings(order, seasonFixtures(s.id)); var lead = t.filter(function (r) { return r.rank === 1 && r.points > 0; });
      var done = seasonFixtures(s.id).filter(E.isCompleted).length;
      return '<div class="hall-row current"><div class="yr">' + esc(seasonLabel(s)) + '<small>In progress · ' + done + '/' + (s.totalRounds || 12) + '</small></div><div class="muted">' + (lead.length ? 'Current leader' + (lead.length > 1 ? 's' : '') + ': <b style="color:var(--ink)">' + esc(listNames(lead.map(function (r) { return nm(r.id); }))) + '</b> on ' + lead[0].points + ' pts' : 'The trophy awaits its first name.') + '</div>' +
        (isAdmin() && done >= (s.totalRounds || 12) ? '<button class="btn btn-gold btn-sm" data-complete-season="' + s.id + '">Crown champion</button>' : '<span></span>') + '</div>';
    }).join('');
    app.innerHTML = '<div class="page container">' + hero('The Honours Board', 'Records are set only by real results — nothing is written here until it has been earned on the course.', '') +
      (isAdmin() ? '<div class="toolbar"><span></span><button class="btn btn-cream" data-action="new-season">' + ICON.plus + 'Start a new season</button></div>' : '') +
      '<section class="honours"><h2>Club Records</h2><div class="rule"></div><div class="honours-grid">' + board + '</div></section>' +
      '<section class="card" style="margin-bottom:18px"><h2>Hall of Champions</h2><p class="card-sub">Every season’s champion, preserved for posterity</p><div class="hall" style="margin-top:14px">' + (hall || '<div class="empty"><p>No seasons yet.</p></div>') + '</div></section></div>';
  }

  function openNewSeason() {
    requireAdmin(function () {
      var n = state.data.seasons.reduce(function (m, s) { return Math.max(m, s.number); }, 0) + 1;
      openModal({
        title: 'Start a new season', sub: 'Creates 12 balanced rounds. Earlier seasons and records are kept.',
        body: '<div class="row-2"><div class="field"><label for="nsN">Season name</label><input class="input" id="nsN" value="Season ' + pad2(n) + '"></div><div class="field"><label for="nsY">Year</label><input class="input" id="nsY" type="number" value="' + new Date().getFullYear() + '"></div></div>' +
          '<div class="callout info">Rotation: ' + E.pairings(ids()).map(function (p) { return esc(teamName(p[0])) + ' v ' + esc(teamName(p[1])); }).join(' → ') + ', repeated four times.</div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nsGo">Create season</button>',
        mount: function (m) {
          $('#nsGo', m).onclick = async function () {
            var b = this; busy(b, true, 'Creating…');
            try { var id = await state.store.createSeason({ name: $('#nsN', m).value.trim(), year: Number($('#nsY', m).value) || null }); closeModal(); await refresh(); if (id) { state.seasonId = id; saveSeasonPref(); } else pickDefaultSeason(true); render(); toast('New season created. Fresh scorecards for everyone.'); }
            catch (e) { busy(b, false); toast(e.message, 'error'); }
          };
        }
      });
    });
  }

  /* ------------------------------------------------------------------ THE TEE SHEET */
  function compTz() { return cfg.timezone && T.validTimeZone(cfg.timezone) ? cfg.timezone : T.DEFAULT_TZ; }
  function tzCity(tz) { return String(tz || '').split('/').pop().replace(/_/g, ' '); }
  function teeUrl() { var base = String(cfg.siteUrl || (location.origin + location.pathname)).replace(/index\.html$/, '').replace(/#.*$/, ''); return base + '#/tee-sheet'; }
  function myPlayerId() { return state.session && state.session.playerId ? state.session.playerId : null; }
  function teeReady() { return !state.data.scheduling || state.data.scheduling.ready !== false; }
  function pollFor(fixtureId) { return T.activePoll(state.data.polls, fixtureId); }
  function pollById(id) { return (state.data.polls || []).filter(function (p) { return p.id === id; })[0]; }
  function slotById(id) { var hit = null; (state.data.polls || []).forEach(function (p) { p.slots.forEach(function (s) { if (s.id === id) hit = { poll: p, slot: s }; }); }); return hit; }
  function agreedSlot(poll) { return poll.slots.filter(function (s) { return s.id === poll.agreedSlotId; })[0] || null; }
  function slotText(s) { return T.longDate(s.date) + ' · ' + T.windowLabel(s); }
  var VOTE_LABEL = { available: 'Available', maybe: 'Maybe', unavailable: 'Unavailable' };
  var VOTE_ICON = { available: ICON.check, maybe: '<svg viewBox="0 0 24 24"><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4M12 17.5v.5"/></svg>', unavailable: ICON.close };

  /** The round the Tee Sheet is about: the first unplayed round with a live poll, else the next round. */
  function teeFocus(c) {
    var open = c.fixtures.filter(function (f) { return !E.isCompleted(f); });
    var withPoll = open.filter(function (f) { return pollFor(f.id); });
    var chosen = open.filter(function (f) { return f.id === state.teeFixtureId; })[0];
    return { fixture: chosen || withPoll[0] || open[0] || null, withPoll: withPoll, open: open };
  }

  function renderTeeSheet() {
    var c = ctx(), fo = teeFocus(c), f = fo.fixture, admin = isAdmin();
    var html = '<div class="page container">' + hero('The Tee Sheet', 'Four players. One tee time. Zero excuses.', '');
    var bar = '';
    if (MODE === 'demo') bar += '<label class="tee-as">Demo — voting as <select class="season-select" id="demoPlayerSel" style="font-style:normal;font-family:var(--sans);font-size:14px">' + players().map(function (p) { return '<option value="' + p.id + '"' + (p.id === myPlayerId() ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>';
    else if (myPlayerId()) bar += '<span class="tee-as">' + avatar(myPlayerId(), 'xs') + ' Voting as <b>' + esc(nm(myPlayerId())) + '</b></span>';
    else if (!state.session) bar += '<button class="btn btn-cream btn-sm" data-tee="sign-in">' + ICON.lock + 'Sign in to vote</button>';
    else bar += '<span class="tee-as">Signed in, but this login isn’t linked to a player yet.</span>';
    var chips = fo.withPoll.length > 1 || (f && fo.withPoll.length && !pollFor(f.id)) ? '<div class="chips">' + fo.withPoll.concat(f && !pollFor(f.id) ? [f] : []).map(function (x) { return '<button class="chip' + (f && x.id === f.id ? ' active' : '') + '" data-tee="focus" data-id="' + x.id + '">Round ' + pad2(x.round) + '</button>'; }).join('') + '</div>' : '<span></span>';
    html += '<div class="toolbar">' + chips + '<div class="btn-row">' + bar + '</div></div>';

    if (!teeReady()) {
      html += '<div class="card empty"><div class="empty-icon">' + ICON.alert + '</div><h4>The Tee Sheet needs a one-off database update</h4><p>Run <b>migrations/002_tee_sheet.sql</b> in the Supabase SQL Editor (see the README), then refresh. Everything else on the site is unaffected.</p></div>';
    } else if (!f) {
      html += '<div class="card empty"><div class="empty-icon">' + ICON.trophy + '</div><h4>Season complete</h4><p>Every round of ' + esc(seasonLabel(c.season)) + ' has been played. Start a new season from the Records page to tee it up again.</p></div>';
    } else {
      var poll = pollFor(f.id);
      if (!poll) html += teeEmpty(f, admin);
      else if (poll.status === 'polling') html += teePolling(f, poll, c, admin);
      else if (poll.status === 'agreed') html += teeAgreed(f, poll, c, admin) + teeHistoryDetails(poll, true);
      else html += teeConfirmed(f, poll, c, admin) + teeHistoryDetails(poll, true);
    }
    // earlier polls (cancelled, or for rounds already played)
    var cur = f ? pollFor(f.id) : null;
    var past = (state.data.polls || []).filter(function (p) { return p.seasonId === state.seasonId && (!cur || p.id !== cur.id) && (p.status === 'cancelled' || E.isCompleted(fixtureById(p.fixtureId) || {})); })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    if (teeReady() && past.length) html += '<section class="card" style="margin-bottom:18px"><h2>Scheduling History</h2><p class="card-sub">Earlier polls and bookings, kept for the record</p><div style="margin-top:12px">' + past.map(function (p) { return teeHistoryDetails(p, false); }).join('') + '</div></section>';
    app.innerHTML = html + '</div>';
  }

  function teeEmpty(f, admin) {
    return '<div class="card empty tee-empty"><div class="empty-icon">' + ICON.calendar + '</div><p class="tee-kicker" style="margin-bottom:6px">Round ' + pad2(f.round) + ' · ' + esc(teamName(f.teamA)) + ' v ' + esc(teamName(f.teamB)) + '</p>' +
      '<h4>Nothing on the tee sheet. Time to organise the next round.</h4><p>' + (f.date ? 'Pencilled in for ' + T.longDate(f.date) + (f.course ? ' at ' + esc(f.course) : '') + ', but nobody has been asked yet.' : 'Propose a few dates, share the link in the group chat and let the website find the winner.') + '</p>' +
      (admin ? '<button class="btn btn-primary" data-tee="create" data-id="' + f.id + '">' + ICON.plus + 'Open a poll for Round ' + pad2(f.round) + '</button>' : (MODE === 'live' && !state.session ? '<button class="btn btn-primary" data-tee="sign-in-admin">' + ICON.lock + 'Organiser sign in</button>' : '<p class="small muted">An organiser can open the poll.</p>')) + '</div>';
  }

  function progressBar(n, total) { return '<div class="tee-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + n + '"><i style="width:' + (total ? n / total * 100 : 0) + '%"></i></div>'; }
  function deadlineText(poll) { return poll.deadline ? T.formatInstant(poll.deadline, poll.timezone) : ''; }

  function teePolling(f, poll, c, admin) {
    var ids = c.ids, pr = T.progress(poll, ids), me = myPlayerId(), open = T.votingOpen(poll);
    var url = teeUrl();
    var shareMsg = T.pollMessage({ round: f.round, deadlineText: deadlineText(poll), responded: pr.count, total: pr.total, url: url });
    var people = ids.map(function (id) {
      var done = pr.responded.indexOf(id) !== -1;
      return '<li class="tee-person' + (done ? ' done' : '') + '">' + avatar(id, 'sm') + '<span class="nm">' + esc(nm(id)) + '</span>' +
        (done ? '<span class="tee-tick">' + ICON.check + '<span class="visually-hidden">Responded</span></span>'
          : '<span class="tee-wait">Awaiting response</span><button class="btn btn-ghost btn-sm" data-tee="remind" data-id="' + poll.id + '" data-player="' + id + '">Copy Reminder</button>') + '</li>';
    }).join('');
    var status = '<section class="card tee-status" aria-labelledby="teeStatusT"><p class="tee-kicker">Round ' + pad2(f.round) + ' — Find a date</p>' +
      '<h2 id="teeStatusT">' + (pr.complete ? 'All four have responded' : 'Awaiting availability') + '</h2>' +
      '<p class="card-sub">' + esc(seasonLabel(c.season)) + ' · ' + esc(teamName(f.teamA)) + ' v ' + esc(teamName(f.teamB)) + '</p>' +
      '<p class="tee-count"><b>' + pr.count + ' of ' + pr.total + '</b> players responded</p>' + progressBar(pr.count, pr.total) +
      '<ul class="tee-people">' + people + '</ul>' +
      (poll.deadline ? '<p class="tee-deadline">' + ICON.calendar + '<span>' + (T.deadlinePassed(poll) ? (poll.closeAtDeadline ? 'Voting closed ' : 'Deadline was ') : 'Vote by ') + '<b>' + deadlineText(poll) + '</b> <span class="muted">(' + esc(tzCity(poll.timezone)) + ' time)</span></span></p>' : '') +
      (poll.notes ? '<p class="committee-quote" style="font-size:15px">' + esc(poll.notes) + '</p>' : '') +
      '<div class="btn-row" style="margin-top:16px"><a class="btn btn-primary" target="_blank" rel="noopener" href="' + esc(T.whatsappUrl(shareMsg)) + '" data-share="poll">' + ICON.whatsapp + 'Share to WhatsApp</a>' +
      '<button class="btn btn-ghost" data-tee="copy-link">' + ICON.copy + 'Copy link</button></div>' +
      (admin ? '<div class="tee-admin-row"><button class="btn btn-ghost btn-sm" data-tee="add-slot" data-id="' + poll.id + '">' + ICON.plus + 'Add a date</button><button class="btn btn-ghost btn-sm" data-tee="edit-poll" data-id="' + poll.id + '">' + ICON.edit + 'Deadline & notes</button><button class="btn btn-danger btn-sm" data-tee="cancel-poll" data-id="' + poll.id + '">Cancel poll</button></div>' : '') +
      '</section>';

    var ranked = T.rankSlots(poll.slots, ids);
    var best = ranked[0];
    var banner = '';
    if (T.noCommonDate(poll, ids)) banner = '<div class="callout tee-banner"><b>No common date yet. Add another option.</b>' + (admin ? ' <button class="btn btn-primary btn-sm" data-tee="add-slot" data-id="' + poll.id + '">' + ICON.plus + 'Add a date</button>' : '') + '</div>';
    else if (best && best.c.tier <= 3) {
      var same = ranked.filter(function (x) { return x.c.tier === best.c.tier; });
      banner = '<div class="win-banner tee-banner ' + best.c.key + '"><span class="trophy">' + (best.c.tier === 1 ? ICON.trophy : ICON.flag) + '</span><div><div class="t1">' + esc(best.c.label) + '</div><div class="t2">' + same.slice(0, 3).map(function (x) { return esc(T.shortDate(x.slot.date) + ' · ' + T.windowLabel(x.slot)); }).join('  /  ') + '</div></div></div>';
    }
    var view = state.teeView === 'best' ? 'best' : 'date';
    var list = view === 'best' ? ranked : T.chronological(poll.slots).map(function (s) { return { slot: s, c: T.classifySlot(s, ids) }; });
    var notice = '';
    if (!open) notice = '<div class="callout">Voting closed at the deadline. An organiser can extend it.</div>';
    else if (MODE === 'live' && !state.session) notice = '<div class="callout info tee-signin">Sign in to add your availability. <button class="btn btn-primary btn-sm" data-tee="sign-in">' + ICON.lock + 'Sign in</button></div>';
    var slotsHtml = list.map(function (x) { return teeSlotCard(poll, x.slot, x.c, me, open, admin, ranked); }).join('');
    var slots = '<section class="card tee-slots" aria-labelledby="teeSlotsT"><div class="card-head"><div><p class="tee-kicker">Round ' + pad2(f.round) + ' · ' + pr.count + ' of ' + pr.total + ' responded</p><h2 id="teeSlotsT">When could we play?</h2><p class="card-sub">' + (me && open ? 'Tap your answer for each date — it saves straight away.' : 'Proposed dates and who can make them.') + '</p></div>' +
      '<div class="tee-view" role="tablist"><button class="' + (view === 'date' ? 'on' : '') + '" data-tee="view" data-id="date" role="tab" aria-selected="' + (view === 'date') + '">By date</button><button class="' + (view === 'best' ? 'on' : '') + '" data-tee="view" data-id="best" role="tab" aria-selected="' + (view === 'best') + '">Best first</button></div></div>' +
      banner + notice + (slotsHtml || '<div class="empty"><p>No dates proposed yet.</p></div>') + '</section>';
    var mustVote = me && open && pr.responded.indexOf(me) === -1;   // on a phone, put the voting first for whoever still owes an answer
    return '<div class="grid tee-grid' + (mustVote ? ' vote-first' : '') + '">' + status + slots + '</div>';
  }

  function voteDots(slot, cls, ids) {
    return '<div class="tee-votes">' + ids.map(function (id) {
      var v = slot.votes[id] || 'none';
      return '<span class="tee-voter ' + v + '" title="' + esc(nm(id)) + ': ' + (VOTE_LABEL[v] || 'Awaiting response') + '">' + avatar(id, 'sm') + '<i>' + (VOTE_ICON[v] || '') + '</i><span class="vn">' + esc(nm(id)) + '</span><span class="visually-hidden">: ' + (VOTE_LABEL[v] || 'Awaiting response') + '</span></span>';
    }).join('') + '</div>';
  }
  function slotSummary(c) {
    var bits = ['<b>' + c.a + ' of ' + c.total + '</b> available'];
    if (c.m) bits.push(c.m + ' maybe');
    if (c.u) bits.push(c.u + ' unavailable');
    if (c.missing) bits.push('awaiting ' + listNames(c.missingIds.map(nm)));
    return bits.join(' · ');
  }
  function teeSlotCard(poll, s, c, me, open, admin, ranked) {
    var mine = me ? s.votes[me] : null;
    var rank = ranked.findIndex(function (x) { return x.slot.id === s.id; }) + 1;
    var buttons = me && open ? '<div class="tee-choice" role="group" aria-label="Your availability for ' + esc(T.shortDate(s.date)) + '">' + T.STATUSES.map(function (st) {
      return '<button type="button" class="' + st + (mine === st ? ' on' : '') + '" data-tee="vote" data-slot="' + s.id + '" data-status="' + st + '" aria-pressed="' + (mine === st) + '">' + VOTE_ICON[st] + '<span>' + (st === 'unavailable' ? 'Can’t' : VOTE_LABEL[st]) + '</span></button>';
    }).join('') + '</div>' : '';
    var adminRow = admin ? '<div class="tee-slot-admin">' +
      (c.lockable ? '<button class="btn btn-gold btn-sm" data-tee="lock" data-id="' + poll.id + '" data-slot="' + s.id + '">' + ICON.lock + 'Lock In Date</button>' : '<span class="small muted">Can’t be locked in while someone is unavailable</span>') +
      '<span style="margin-left:auto;display:flex;gap:6px"><button class="icon-btn' + (s.preferred ? ' on' : '') + '" data-tee="prefer" data-slot="' + s.id + '" aria-label="' + (s.preferred ? 'Remove preferred mark' : 'Mark as preferred') + '" aria-pressed="' + !!s.preferred + '">' + ICON.star + '</button>' +
      '<button class="icon-btn" data-tee="correct" data-slot="' + s.id + '" aria-label="Correct a vote">' + ICON.edit + '</button>' +
      '<button class="icon-btn" data-tee="remove-slot" data-slot="' + s.id + '" aria-label="Remove this date">' + ICON.trash + '</button></span></div>' : '';
    return '<article class="tee-slot ' + c.key + '" data-slot-id="' + s.id + '"><header><div><h3>' + esc(T.slotLabel(s)) + '</h3>' +
      (s.preferred ? '<span class="tee-pref">' + ICON.star + 'Organiser’s pick</span>' : '') + (s.notes ? '<p class="small muted" style="margin:2px 0 0">' + esc(s.notes) + '</p>' : '') + '</div>' +
      '<span class="tee-badge ' + c.key + '">' + (c.tier <= 3 && rank === 1 ? '★ ' : '') + esc(c.label) + '</span></header>' +
      voteDots(s, '', ctxIds()) + '<p class="tee-sum">' + slotSummary(c) + '</p>' + buttons + adminRow + '</article>';
  }
  function ctxIds() { return ids(); }

  function playersLine(idsList) { return idsList.map(function (id) { return esc(nm(id)); }).join(' · '); }

  function teeAgreed(f, poll, c, admin) {
    var s = agreedSlot(poll), ids = c.ids, pending = T.pendingAgreement(poll, ids), me = myPlayerId();
    var msg = T.agreedMessage({ round: f.round, dateText: s ? T.longDate(s.date) : '', windowText: s ? T.windowLabel(s) : '', pendingNames: pending.map(nm), url: teeUrl() });
    var people = ids.map(function (id) {
      var a = poll.agreements.filter(function (x) { return x.playerId === id; })[0];
      var vote = s ? s.votes[id] : null;
      return '<li class="tee-person' + (a ? ' done' : '') + '">' + avatar(id, 'sm') + '<span class="nm">' + esc(nm(id)) + '</span>' +
        (a ? '<span class="tee-wait" style="color:var(--ok)">' + (a.via === 'vote' ? 'Available' : a.via === 'admin' ? 'Confirmed (via organiser)' : 'Confirmed') + '</span><span class="tee-tick">' + ICON.check + '</span>'
          : '<span class="tee-wait">' + (vote === 'maybe' ? 'Said maybe — needs to confirm' : 'Hasn’t answered — needs to confirm') + '</span>' +
            (me === id ? '<button class="btn btn-primary btn-sm" data-tee="im-in" data-id="' + poll.id + '">' + ICON.check + 'I’m in</button>' : (admin ? '<button class="btn btn-ghost btn-sm" data-tee="mark-in" data-id="' + poll.id + '" data-player="' + id + '">Mark confirmed</button>' : ''))) + '</li>';
    }).join('');
    return '<section class="card tee-hero-card agreed" aria-labelledby="teeAgT"><div class="tee-hero-main"><p class="tee-kicker">Round ' + pad2(f.round) + ' — Date agreed</p>' +
      '<h2 id="teeAgT" class="tee-date">' + (s ? T.longDate(s.date) : 'Date agreed') + '</h2>' +
      '<p class="tee-time">' + (s ? esc(T.windowLabel(s)) : '') + '</p>' +
      '<p class="tee-course"><span class="badge next" style="margin:0">Booking pending</span> <span class="muted">' + (f.course ? 'Pencilled for ' + esc(f.course) : 'Course to be booked') + '</span></p>' +
      '<p class="tee-count" style="margin-top:14px">' + (pending.length ? '<b>Agreed by ' + (ids.length - pending.length) + ' of ' + ids.length + '</b> — awaiting ' + esc(listNames(pending.map(nm))) : '<b>Agreed by all four.</b> Over to the organiser to book the course.') + '</p>' +
      '<div class="btn-row" style="margin-top:14px"><a class="btn btn-primary" target="_blank" rel="noopener" href="' + esc(T.whatsappUrl(msg)) + '" data-share="agreed">' + ICON.whatsapp + 'Share to WhatsApp</a>' +
      (admin ? '<button class="btn btn-gold" data-tee="confirm-tee" data-id="' + poll.id + '">' + ICON.flag + 'Confirm Tee Time</button><button class="btn btn-ghost" data-tee="reopen" data-id="' + poll.id + '">Reopen voting</button>' : '') + '</div>' +
      (admin && pending.length ? '<p class="small muted" style="margin:10px 0 0">The tee time can be confirmed once all four are in.</p>' : '') + '</div>' +
      '<ul class="tee-people tee-hero-side">' + people + '</ul></section>';
  }

  function teeConfirmed(f, poll, c, admin) {
    var ids = c.ids;
    var msg = T.confirmedMessage({ round: f.round, course: poll.course, teeDate: poll.teeDate, teeTime: poll.teeTime, names: ids.map(nm), url: teeUrl() });
    return '<section class="card tee-hero-card confirmed" aria-labelledby="teeCfT"><div class="tee-hero-main"><p class="tee-kicker">Round ' + pad2(f.round) + ' — Confirmed <span class="tee-badge perfect" style="margin-left:8px">' + ICON.check + 'Tee time confirmed</span></p>' +
      '<h2 id="teeCfT" class="tee-date">' + T.longDate(poll.teeDate) + '</h2>' +
      '<p class="tee-time">' + T.time12(poll.teeTime) + ' <span class="muted" style="font-size:14px;font-family:var(--sans)">' + esc(tzCity(poll.timezone)) + ' time</span></p>' +
      '<p class="tee-course">' + ICON.golf + '<span>' + esc(poll.course) + '</span></p>' +
      '<p class="tee-players">' + playersLine(ids) + '</p>' +
      (poll.bookingRef || poll.bookingNotes ? '<p class="small muted" style="margin:8px 0 0">' + (poll.bookingRef ? 'Booking ref <b style="color:var(--ink)">' + esc(poll.bookingRef) + '</b>' : '') + (poll.bookingRef && poll.bookingNotes ? ' · ' : '') + esc(poll.bookingNotes || '') + '</p>' : '') +
      '<div class="btn-row" style="margin-top:16px"><button class="btn btn-primary" data-tee="ics" data-id="' + poll.id + '">' + ICON.calendar + 'Add to Calendar</button>' +
      '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + esc(T.whatsappUrl(msg)) + '" data-share="confirmed">' + ICON.whatsapp + 'Share to WhatsApp</a>' +
      (navigator.share ? '<button class="btn btn-ghost" data-tee="native-share" data-id="' + poll.id + '">' + ICON.share + 'Share…</button>' : '') + '</div>' +
      (admin ? '<div class="tee-admin-row"><button class="btn btn-ghost btn-sm" data-tee="confirm-tee" data-id="' + poll.id + '">' + ICON.edit + 'Edit booking</button><button class="btn btn-ghost btn-sm" data-tee="reopen" data-id="' + poll.id + '">Reopen scheduling</button></div>' : '') + '</div>' +
      '<div class="tee-hero-side tee-foursome">' + ids.map(function (id) { return '<span class="tee-voter available">' + avatar(id, 'lg') + '<i>' + ICON.check + '</i><span class="vn">' + esc(nm(id)) + '</span></span>'; }).join('') + '</div></section>';
  }

  var EVENT_TEXT = {
    poll_opened: function (d) { return 'Poll opened' + (d.slots ? ' with ' + plural(d.slots, 'date') : ''); },
    poll_updated: function () { return 'Deadline or notes updated'; },
    slot_added: function (d) { return 'Date added: ' + T.shortDate(d.date); },
    slot_removed: function (d) { return 'Date removed: ' + T.shortDate(d.date); },
    vote_corrected: function (d) { return nm(d.player) + '’s vote set to ' + (VOTE_LABEL[d.status] || d.status) + (d.date ? ' for ' + T.shortDate(d.date) : '') + ' by an organiser'; },
    date_agreed: function (d) { return 'Date locked in: ' + T.shortDate(d.date); },
    player_confirmed: function (d) { return nm(d.player) + ' confirmed' + (d.via === 'admin' ? ' (recorded by an organiser)' : ''); },
    tee_time_confirmed: function (d) { return 'Tee time confirmed: ' + T.shortDate(d.tee_date) + ', ' + T.time12(String(d.tee_time || '').slice(0, 5)) + ' at ' + d.course; },
    booking_amended: function (d) { return 'Booking changed to ' + T.shortDate(d.tee_date) + ', ' + T.time12(String(d.tee_time || '').slice(0, 5)) + ' at ' + d.course; },
    reopened: function (d) { return 'Scheduling reopened' + (d.from === 'confirmed' && d.tee_date ? ' (was ' + T.shortDate(d.tee_date) + ', ' + T.time12(String(d.tee_time || '').slice(0, 5)) + ' at ' + d.course + ')' : d.agreed_date ? ' (was agreed for ' + T.shortDate(d.agreed_date) + ')' : ''); },
    cancelled: function () { return 'Poll cancelled'; }
  };
  function teeHistoryDetails(poll, withCard) {
    var f = fixtureById(poll.fixtureId) || { round: '?' }, idsL = ids();
    var label = { polling: 'Voting open', agreed: 'Date agreed', confirmed: 'Confirmed', cancelled: 'Cancelled' }[poll.status];
    var rows = T.chronological(poll.slots).map(function (s) {
      var c = T.classifySlot(s, idsL);
      return '<tr' + (s.id === poll.agreedSlotId ? ' class="agreed-row"' : '') + '><td><b>' + esc(T.shortDate(s.date)) + '</b><div class="small muted">' + esc(T.windowLabel(s)) + (s.id === poll.agreedSlotId ? ' · chosen' : '') + '</div></td>' +
        idsL.map(function (id) { var v = s.votes[id] || 'none'; return '<td class="tee-cell ' + v + '" title="' + esc(nm(id)) + ': ' + (VOTE_LABEL[v] || 'No reply') + '">' + (VOTE_ICON[v] || '–') + '<span class="visually-hidden">' + (VOTE_LABEL[v] || 'No reply') + '</span></td>'; }).join('') +
        '<td class="hide-sm"><span class="tee-badge ' + c.key + '">' + esc(c.label) + '</span></td></tr>';
    }).join('');
    var events = poll.events.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).map(function (e) {
      var fn = EVENT_TEXT[e.type];
      return '<li><span>' + esc(T.formatInstant(e.at, poll.timezone)) + '</span><span>' + esc(fn ? fn(e.data || {}) : e.type) + (e.playerId && ['player_confirmed', 'vote_corrected'].indexOf(e.type) === -1 ? ' <span class="muted">· ' + esc(nm(e.playerId)) + '</span>' : '') + '</span></li>';
    }).join('');
    var inner = '<details class="tee-history"><summary><span><b>' + (withCard ? 'Poll history' : 'Round ' + pad2(f.round)) + '</b> <span class="muted">· ' + label + (poll.status === 'confirmed' ? ' · ' + esc(T.shortDate(poll.teeDate) + ', ' + T.time12(poll.teeTime) + ' · ' + poll.course) : '') + ' · ' + plural(poll.slots.length, 'date') + ' proposed</span></span>' + ICON.arrow + '</summary>' +
      (rows ? '<div class="table-wrap"><table class="data-table tee-table"><thead><tr><th>Date</th>' + idsL.map(function (id) { return '<th style="text-align:center">' + esc(nm(id)) + '</th>'; }).join('') + '<th class="hide-sm">Outcome</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
      (events ? '<ul class="confirm-list tee-log">' + events + '</ul>' : '') + '</details>';
    return withCard ? '<section class="card" style="margin-bottom:18px">' + inner + '</section>' : inner;
  }

  /* ---- Tee Sheet actions ---- */
  function requirePlayer(fn) {
    if (myPlayerId()) return fn();
    if (MODE === 'live' && !state.session) return openSignIn(fn, 'player');
    toast('This login isn’t linked to a player. Ask an organiser to link it (see README).', 'error');
  }
  async function teeDo(promise, okMsg, btn) {
    if (btn) busy(btn, true, 'Saving…');
    try { await promise; closeModal(); if (okMsg) toast(okMsg); await refresh(); return true; }
    catch (e) { if (btn) busy(btn, false); toast(e.message || 'Something went wrong.', 'error'); await refresh(); return false; }
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || 'Copied.'); }
    function legacy() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy — long-press to copy instead.', 'error'); } ta.remove(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy); else legacy();
  }
  var votePending = {};
  function castVote(slotId, status) {
    requirePlayer(function () {
      var hit = slotById(slotId), me = myPlayerId(); if (!hit) return;
      var before = hit.slot.votes[me], wasDone = T.progress(hit.poll, ids()).responded.indexOf(me) !== -1;
      if (before === status) return;
      hit.slot.votes[me] = status;                     // optimistic — feels instant on a phone
      render();
      var token = votePending[slotId] = {};
      state.store.castVote(slotId, status).then(function () {
        if (votePending[slotId] !== token) return;      // a newer tap superseded this one
        delete votePending[slotId];
        var pr = T.progress(hit.poll, ids());
        if (!wasDone && pr.responded.indexOf(me) !== -1) toast('All done, ' + nm(me) + '. ' + pr.count + ' of ' + pr.total + ' have responded.');
        if (!Object.keys(votePending).length) refresh();
      }).catch(function (e) {
        delete votePending[slotId];
        toast(e.message || 'Could not save your vote.', 'error'); refresh();
      });
    });
  }

  function slotFields(i, s) {
    return '<div class="tee-slot-line" data-i="' + i + '"><input class="input" type="date" data-k="date" value="' + esc(s.date || '') + '" aria-label="Date">' +
      '<select class="input" data-k="window" aria-label="Time window">' + Object.keys(T.WINDOWS).map(function (w) { return '<option value="' + w + '"' + (w === s.window ? ' selected' : '') + '>' + T.WINDOWS[w] + '</option>'; }).join('') + '</select>' +
      '<input class="input" type="time" data-k="startTime" value="' + esc(s.startTime || '') + '" aria-label="Start time"' + (s.window === 'time' ? '' : ' hidden') + '>' +
      '<input class="input tl-note" data-k="notes" value="' + esc(s.notes || '') + '" placeholder="Note (optional)" aria-label="Note">' +
      '<button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remove date">' + ICON.trash + '</button></div>';
  }
  function bindSlotLines(box, list, redraw) {
    box.oninput = box.onchange = function (e) {
      var line = e.target.closest('.tee-slot-line'); if (!line || !e.target.dataset.k) return;
      var s = list[+line.dataset.i]; s[e.target.dataset.k] = e.target.value;
      if (e.target.dataset.k === 'window') { var t = $('[data-k="startTime"]', line); t.hidden = s.window !== 'time'; if (s.window === 'time' && !s.startTime) { s.startTime = '07:30'; t.value = '07:30'; } }
    };
    box.onclick = function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; list.splice(+b.dataset.rm, 1); redraw(); };
  }
  function isoAdd(iso, days) { var p = iso.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function nextWeekends(n) {
    var today = T.utcToZoned(new Date(), compTz()).date, out = [], d = isoAdd(today, 1);
    while (out.length < n * 2) { var wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 6 || wd === 0) out.push(d); d = isoAdd(d, 1); }
    return out;
  }
  function validateSlots(list) {
    var seen = {};
    if (!list.length) return 'Propose at least one date.';
    for (var i = 0; i < list.length; i++) {
      var errs = T.validateSlot(list[i]); if (errs.length) return 'Date ' + (i + 1) + ': ' + errs[0];
      var k = T.slotKey(list[i]); if (seen[k]) return 'Date ' + (i + 1) + ' is a duplicate.'; seen[k] = 1;
    }
    return '';
  }
  function deadlineFields(poll, tz) {
    var z = poll && poll.deadline ? T.utcToZoned(poll.deadline, tz) : { date: '', time: '18:00' };
    return '<div class="row-2 keep"><div class="field"><label for="tpDd">Vote by <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></label><input class="input" type="date" id="tpDd" value="' + z.date + '"></div>' +
      '<div class="field"><label for="tpDt">Time (' + esc(tzCity(tz)) + ')</label><input class="input" type="time" id="tpDt" value="' + z.time + '"></div></div>' +
      '<label class="check"><input type="checkbox" id="tpStrict"' + (poll && poll.closeAtDeadline ? ' checked' : '') + '> Close voting at the deadline <span class="muted small">(otherwise it’s just a nudge)</span></label>';
  }
  function readDeadline(m, tz) { var d = $('#tpDd', m).value, t = $('#tpDt', m).value || '18:00'; return d ? T.zonedToUtc(d, t, tz).toISOString() : null; }

  function openPollCreate(fixtureId) {
    requireAdmin(function () {
      var c = ctx(), tz = compTz();
      var rounds = c.fixtures.filter(function (f) { return !E.isCompleted(f) && !pollFor(f.id); });
      if (!rounds.length) { toast('Every upcoming round already has a poll.', 'error'); return; }
      var form = { fixtureId: rounds.some(function (f) { return f.id === fixtureId; }) ? fixtureId : rounds[0].id, slots: nextWeekends(2).map(function (d) { return { date: d, window: 'morning', startTime: '', notes: '' }; }) };
      var modal = openModal({ title: 'Open a scheduling poll', body: '', wide: true });
      function draw() {
        modal.draw({
          title: 'Open a scheduling poll', sub: 'Propose a few dates. Players vote Available, Maybe or Unavailable.', wide: true,
          body: '<div class="field"><label for="tpRound">Round</label><select class="input" id="tpRound">' + rounds.map(function (f) { return '<option value="' + f.id + '"' + (f.id === form.fixtureId ? ' selected' : '') + '>Round ' + pad2(f.round) + ' — ' + esc(teamName(f.teamA)) + ' v ' + esc(teamName(f.teamB)) + '</option>'; }).join('') + '</select></div>' +
            '<div class="section-label" style="margin-top:4px"><span>Proposed dates</span><button type="button" class="btn btn-ghost btn-sm" id="tpAdd">' + ICON.plus + 'Add a date</button></div>' +
            '<div id="tpSlots">' + form.slots.map(function (s, i) { return slotFields(i, s); }).join('') + '</div>' +
            '<div class="field-error" id="tpErr" role="alert" style="margin-bottom:10px"></div>' + deadlineFields(null, tz) +
            '<div class="field" style="margin-top:8px"><label for="tpNotes">Notes <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></label><textarea class="input" id="tpNotes" style="min-height:60px" placeholder="Course ideas, who’s driving…">' + esc(form.notes || '') + '</textarea></div>' +
            '<p class="small muted" style="margin:0">Dates and times are in ' + esc(tzCity(tz)) + ' time (' + esc(tz) + ').</p>',
          foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tpGo">Open the poll</button>',
          mount: function (m) {
            $('#tpRound', m).onchange = function () { form.fixtureId = this.value; };
            $('#tpNotes', m).oninput = function () { form.notes = this.value; };
            $('#tpAdd', m).onclick = function () { var last = form.slots[form.slots.length - 1]; form.slots.push({ date: last && last.date ? isoAdd(last.date, 7) : '', window: last ? last.window : 'morning', startTime: last ? last.startTime : '', notes: '' }); form.notes = $('#tpNotes', m).value; draw(); };
            bindSlotLines($('#tpSlots', m), form.slots, draw);
            $('#tpGo', m).onclick = function () {
              var err = validateSlots(form.slots); if (err) { $('#tpErr', m).textContent = err; return; }
              var f = fixtureById(form.fixtureId);
              teeDo(state.store.createPoll({ fixtureId: form.fixtureId, deadline: readDeadline(m, tz), closeAtDeadline: $('#tpStrict', m).checked, notes: $('#tpNotes', m).value.trim(), timezone: tz, slots: form.slots }), 'Round ' + pad2(f.round) + ' is on the tee sheet. Share it with the group.', this)
                .then(function (ok) { if (ok) { state.teeFixtureId = form.fixtureId; render(); } });
            };
          }
        });
      }
      draw();
    });
  }
  function openSlotAdd(pollId) {
    requireAdmin(function () {
      var poll = pollById(pollId), last = T.chronological(poll.slots).pop();
      var s = { date: last ? isoAdd(last.date, 7) : '', window: 'morning', startTime: '', notes: '' }, list = [s];
      openModal({
        title: 'Add a date', sub: 'Everyone will need to answer the new option.',
        body: '<div id="tpSlots">' + slotFields(0, s) + '</div><div class="field-error" id="tpErr" role="alert"></div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tpGo">Add date</button>',
        mount: function (m) {
          $('[data-rm]', m).hidden = true; bindSlotLines($('#tpSlots', m), list, function () {});
          $('#tpGo', m).onclick = function () { var e = T.validateSlot(s); if (e.length) { $('#tpErr', m).textContent = e[0]; return; } teeDo(state.store.addSlot(pollId, s), T.shortDate(s.date) + ' added to the tee sheet.', this); };
        }
      });
    });
  }
  function openPollEdit(pollId) {
    requireAdmin(function () {
      var poll = pollById(pollId);
      openModal({
        title: 'Deadline & notes', body: deadlineFields(poll, poll.timezone) + '<div class="field" style="margin-top:8px"><label for="tpNotes">Notes</label><textarea class="input" id="tpNotes" style="min-height:60px">' + esc(poll.notes || '') + '</textarea></div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tpGo">Save</button>',
        mount: function (m) { $('#tpGo', m).onclick = function () { teeDo(state.store.updatePoll(pollId, { deadline: readDeadline(m, poll.timezone), closeAtDeadline: $('#tpStrict', m).checked, notes: $('#tpNotes', m).value.trim() }), 'Poll updated.', this); }; }
      });
    });
  }
  function openVoteCorrect(slotId) {
    requireAdmin(function () {
      var hit = slotById(slotId);
      openModal({
        title: 'Correct a vote', sub: esc(slotText(hit.slot)) + ' · logged in the poll history',
        body: '<div class="callout">Only do this when the player has asked you to. Everyone can see that an organiser changed it.</div><div class="row-2 keep"><div class="field"><label for="vcP">Player</label><select class="input" id="vcP">' + players().map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + ' — ' + (VOTE_LABEL[hit.slot.votes[p.id]] || 'no reply') + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="vcS">Availability</label><select class="input" id="vcS">' + T.STATUSES.map(function (s) { return '<option value="' + s + '">' + VOTE_LABEL[s] + '</option>'; }).join('') + '</select></div></div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="vcGo">Save vote</button>',
        mount: function (m) { $('#vcGo', m).onclick = function () { teeDo(state.store.adminSetVote(slotId, $('#vcP', m).value, $('#vcS', m).value), 'Vote updated.', this); }; }
      });
    });
  }
  function lockIn(pollId, slotId) {
    requireAdmin(function () {
      var hit = slotById(slotId), c = T.classifySlot(hit.slot, ids());
      var need = c.needsConfirmation.map(nm);
      confirmDialog('Lock in ' + esc(T.shortDate(hit.slot.date)) + '?', '<b>' + esc(slotText(hit.slot)) + '</b> — ' + esc(c.label.toLowerCase()) + '. Voting closes and the date is marked as agreed.' +
        (need.length ? '<br><br>' + esc(listNames(need)) + ' didn’t say “Available”, so ' + (need.length > 1 ? 'they’ll each' : 'they’ll') + ' need to tap <b>I’m in</b> before the tee time can be confirmed.' : '<br><br>All four said they’re available.'), 'Lock In Date').then(function (ok) {
        if (ok) teeDo(state.store.lockIn(pollId, slotId), 'Date agreed: ' + T.longDate(hit.slot.date) + '. Now book the course.');
      });
    });
  }
  function openConfirmTee(pollId) {
    requireAdmin(function () {
      var poll = pollById(pollId), f = fixtureById(poll.fixtureId), s = agreedSlot(poll), editing = poll.status === 'confirmed';
      var d = { course: poll.course || f.course || '', date: poll.teeDate || (s ? s.date : ''), time: poll.teeTime || (s ? T.suggestedStart(s) : '08:00'), dur: poll.durationMinutes || T.DEFAULT_DURATION };
      var durs = [240, 270, 300, 330]; if (durs.indexOf(d.dur) === -1) durs.push(d.dur);
      openModal({
        title: editing ? 'Edit booking' : 'Confirm tee time', sub: 'Round ' + pad2(f.round) + ' · updates the fixture everywhere on the site',
        body: '<div class="field"><label for="ctCourse">Golf course</label><input class="input" id="ctCourse" list="courseList" value="' + esc(d.course) + '" placeholder="e.g. Wembley Golf Course">' + courseDatalist() + '</div>' +
          '<div class="row-2 keep"><div class="field"><label for="ctDate">Tee-off date</label><input class="input" type="date" id="ctDate" value="' + esc(d.date) + '"></div><div class="field"><label for="ctTime">Tee-off time (' + esc(tzCity(poll.timezone)) + ')</label><input class="input" type="time" id="ctTime" value="' + esc(d.time) + '"></div></div>' +
          '<div class="row-2 keep"><div class="field"><label for="ctRef">Booking reference <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></label><input class="input" id="ctRef" value="' + esc(poll.bookingRef || '') + '"></div>' +
          '<div class="field"><label for="ctDur">Calendar duration</label><select class="input" id="ctDur">' + durs.map(function (x) { return '<option value="' + x + '"' + (x === d.dur ? ' selected' : '') + '>' + (x / 60) + ' hours</option>'; }).join('') + '</select></div></div>' +
          '<div class="field"><label for="ctNotes">Notes <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></label><textarea class="input" id="ctNotes" style="min-height:60px" placeholder="Carts, meeting point, dress code…">' + esc(poll.bookingNotes || '') + '</textarea></div>' +
          (poll.bookingRef !== undefined ? '<p class="small muted" style="margin:0">The booking reference is visible to anyone who opens the site.</p>' : '') + '<div class="field-error" id="ctErr" role="alert"></div>',
        foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ctGo">' + ICON.check + (editing ? 'Save booking' : 'Confirm tee time') + '</button>',
        mount: function (m) {
          $('#ctGo', m).onclick = function () {
            var b = { course: $('#ctCourse', m).value.trim(), teeDate: $('#ctDate', m).value, teeTime: $('#ctTime', m).value, bookingRef: $('#ctRef', m).value.trim(), notes: $('#ctNotes', m).value.trim(), durationMinutes: Number($('#ctDur', m).value) };
            if (!b.course) { $('#ctErr', m).textContent = 'Enter the golf course.'; return; }
            if (!T.validDate(b.teeDate) || !T.validTime(b.teeTime)) { $('#ctErr', m).textContent = 'Enter the tee-off date and time.'; return; }
            teeDo(state.store.confirmTeeTime(pollId, b), 'Locked in: ' + T.shortDate(b.teeDate) + ', ' + T.time12(b.teeTime) + ' at ' + b.course + '.', this);
          };
        }
      });
    });
  }
  function downloadIcs(pollId) {
    var poll = pollById(pollId), f = fixtureById(poll.fixtureId);
    var ics = T.buildIcs({ uid: poll.id, round: f.round, teeDate: poll.teeDate, teeTime: poll.teeTime, timezone: poll.timezone, durationMinutes: poll.durationMinutes, course: poll.course, names: ids().map(nm), bookingRef: poll.bookingRef, notes: poll.bookingNotes, url: teeUrl() });
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'designated-drivers-round-' + pad2(f.round) + '.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('Calendar file downloaded — open it to add the round.');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tee]'); if (!t || !state.data) return;
    var a = t.dataset.tee, id = t.dataset.id, slot = t.dataset.slot;
    if (a === 'vote') castVote(slot, t.dataset.status);
    else if (a === 'view') { state.teeView = id; render(); }
    else if (a === 'focus') { state.teeFixtureId = id; render(); }
    else if (a === 'sign-in') openSignIn(null, 'player');
    else if (a === 'sign-in-admin') openSignIn(null, 'admin');
    else if (a === 'create') openPollCreate(id);
    else if (a === 'add-slot') openSlotAdd(id);
    else if (a === 'edit-poll') openPollEdit(id);
    else if (a === 'correct') openVoteCorrect(slot);
    else if (a === 'lock') lockIn(id, slot);
    else if (a === 'confirm-tee') openConfirmTee(id);
    else if (a === 'ics') downloadIcs(id);
    else if (a === 'copy-link') copyText(teeUrl(), 'Link copied — paste it in the group chat.');
    else if (a === 'prefer') requireAdmin(function () { var h = slotById(slot); teeDo(state.store.setSlotPreferred(slot, !h.slot.preferred)); });
    else if (a === 'im-in') requirePlayer(function () { teeDo(state.store.confirmAttendance(id), 'You’re in. See you on the first tee.', t); });
    else if (a === 'mark-in') requireAdmin(function () { teeDo(state.store.adminConfirmAttendance(id, t.dataset.player), nm(t.dataset.player) + ' marked as confirmed.', t); });
    else if (a === 'remind') {
      var poll = pollById(id), f = fixtureById(poll.fixtureId), out = T.progress(poll, ids()).outstanding;
      copyText(T.reminderMessage({ name: nm(t.dataset.player), round: f.round, last: out.length === 1, url: teeUrl() }), 'Reminder copied — paste it into WhatsApp. Nothing has been sent.');
    }
    else if (a === 'native-share') {
      var p2 = pollById(id), f2 = fixtureById(p2.fixtureId);
      var text = T.confirmedMessage({ round: f2.round, course: p2.course, teeDate: p2.teeDate, teeTime: p2.teeTime, names: ids().map(nm), url: teeUrl() });
      navigator.share({ text: text }).catch(function () {});
    }
    else if (a === 'remove-slot') requireAdmin(function () {
      var h = slotById(slot);
      confirmDialog('Remove ' + esc(T.shortDate(h.slot.date)) + '?', 'This date and its votes come off the tee sheet. It stays in the poll history.', 'Remove date', true).then(function (ok) { if (ok) teeDo(state.store.removeSlot(slot), 'Date removed.'); });
    });
    else if (a === 'reopen') requireAdmin(function () {
      var p3 = pollById(id);
      confirmDialog('Reopen scheduling?', (p3.status === 'confirmed' ? 'The confirmed tee time is withdrawn and the fixture goes back to “date to be confirmed”. ' : 'The agreed date is withdrawn. ') + 'Every vote is kept, and the change is recorded in the poll history.', 'Reopen voting').then(function (ok) { if (ok) teeDo(state.store.reopenPoll(id), 'Voting is open again.'); });
    });
    else if (a === 'cancel-poll') requireAdmin(function () {
      confirmDialog('Cancel this poll?', 'Voting stops and the poll moves to the scheduling history. You can open a fresh poll for the round afterwards.', 'Cancel poll', true).then(function (ok) { if (ok) teeDo(state.store.cancelPoll(id), 'Poll cancelled.'); });
    });
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'demoPlayerSel' && state.store.setDemoPlayer) { state.store.setDemoPlayer(e.target.value); state.session.playerId = e.target.value; render(); }
  });

  /* ------------------------------------------------------------------ routing & render */
  function parseRoute() {
    var h = (location.hash || '#/clubhouse').replace(/^#\/?/, '').split('/');
    var page = h[0] || 'clubhouse';
    if (['clubhouse', 'fixtures', 'tee-sheet', 'players', 'fines', 'records'].indexOf(page) === -1) page = 'clubhouse';
    return { page: page, id: h[1] || null };
  }
  function render(scrollTop) {
    if (!state.data) return;
    if (!season()) { app.innerHTML = '<div class="page container"><div class="card empty" style="margin:40px 0"><h4>No season found</h4><p>Run supabase-schema.sql to seed Season 01, or start a season from the Records page.</p></div></div>'; return; }
    destroyCharts();
    var r = state.route = parseRoute();
    $$('[data-nav]').forEach(function (a) { var on = a.dataset.nav === r.page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (r.page === 'clubhouse') renderClubhouse();
    else if (r.page === 'fixtures') renderFixtures();
    else if (r.page === 'players') { if (r.id) renderPlayer(r.id); else renderPlayers(); }
    else if (r.page === 'fines') renderFines();
    else if (r.page === 'records') renderRecords();
    else if (r.page === 'tee-sheet') renderTeeSheet();
    if (!scrollTop) { var pg = $('.page', app); if (pg) pg.style.animation = 'none'; }   // data refresh: no page-in animation
    var titles = { clubhouse: 'The Clubhouse', fixtures: 'Fixtures', 'tee-sheet': 'The Tee Sheet', players: r.id ? nm(r.id) : 'Players', fines: 'The Disciplinary Committee', records: 'Records' };
    document.title = titles[r.page] + ' · Designated Drivers';
    if (scrollTop) window.scrollTo(0, 0);
  }

  async function refresh(goTo) {
    try {
      state.data = await state.store.load();
      pickDefaultSeason(false);
      if (goTo && location.hash !== goTo) { location.hash = goTo; return; } // hashchange renders once
      render();
    } catch (e) { toast('Could not load the latest data: ' + e.message, 'error'); }
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
    var t = e.target.closest('[data-action],[data-fixture],[data-href],[data-filter],[data-edit-fine],[data-del-fine],[data-toggle-paid],[data-edit-cat],[data-complete-season]');
    if (!t || !state.data) return;
    if (t.closest('.modal') && !t.dataset.action) return;
    var a = t.dataset.action;
    if (a === 'submit-result') { e.preventDefault(); closeModal(); openSubmit(); }
    else if (a === 'sign-in') openSignIn(null, 'any');
    else if (a === 'sign-out') { state.store.signOut().then(function () { state.session = null; renderFooter(); render(); toast('Signed out.'); }); }
    else if (a === 'reset-demo') { confirmDialog('Reset demo data?', 'This restores the fictional demo season in this browser.', 'Reset').then(function (ok) { if (ok) state.store.reset().then(function (d) { state.data = d; state.prevSeries = null; pickDefaultSeason(true); render(); toast('Demo data reset.'); }); }); }
    else if (a === 'add-fine') openFine();
    else if (a === 'add-category') openCategory();
    else if (a === 'new-season') openNewSeason();
    else if (t.dataset.fixture) openFixture(t.dataset.fixture);
    else if (t.dataset.href) location.hash = t.dataset.href;
    else if (t.dataset.filter) { state.fixtureFilter = t.dataset.filter; render(); }
    else if (t.dataset.editFine) openFine(t.dataset.editFine);
    else if (t.dataset.editCat) openCategory(t.dataset.editCat);
    else if (t.dataset.togglePaid) {
      var f = state.data.fines.filter(function (x) { return x.id === t.dataset.togglePaid; })[0];
      requireAdmin(function () { t.disabled = true; state.store.updateFine(f.id, { paid: !f.paid }).then(function () { toast(f.paid ? 'Marked as owing.' : nm(f.playerId) + ' has paid ' + money(f.amount) + '.'); return refresh(); }).catch(function (err) { t.disabled = false; toast(err.message, 'error'); }); });
    }
    else if (t.dataset.delFine) {
      var fd = state.data.fines.filter(function (x) { return x.id === t.dataset.delFine; })[0];
      confirmDialog('Remove this fine?', esc(nm(fd.playerId)) + ' — ' + esc(fd.categoryName) + ' (' + money(fd.amount) + '). This cannot be undone.', 'Remove fine', true).then(function (ok) {
        if (ok) state.store.deleteFine(fd.id).then(function () { toast('Fine removed. Clemency granted.'); return refresh(); }).catch(function (err) { toast(err.message, 'error'); });
      });
    }
    else if (t.dataset.completeSeason) {
      var sid = t.dataset.completeSeason;
      confirmDialog('Crown the champion?', 'This marks the season complete and adds the champion to the Hall of Champions.', 'Crown champion').then(function (ok) {
        if (ok) state.store.setSeasonStatus(sid, 'completed').then(function () { toast('A champion is crowned!'); return refresh(); }).catch(function (err) { toast(err.message, 'error'); });
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
  window.addEventListener('hashchange', function () { closeModal(); render(true); });

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    if (MODE === 'live' && !window.supabase) {
      app.innerHTML = '<div class="container"><div class="card empty" style="margin:40px 0"><h4>Could not reach the database library</h4><p>The Supabase client failed to load. Check your connection and refresh.</p></div></div>';
      return;
    }
    state.store = MODE === 'live' ? new D.SupabaseStore(cfg) : new D.DemoStore();
    if (MODE === 'demo') {
      var b = $('#demoBanner'); b.hidden = false;
      if (liveConfigured) b.innerHTML = '<strong>Demo mode</strong> (forced with ?demo) — fictional results in this browser only. <a href="' + location.pathname + '" style="font-weight:600">Open the real championship</a>';
    }
    try {
      state.data = await state.store.load();
      try { state.session = await state.store.session(); } catch (e) { state.session = null; }
      pickDefaultSeason(false);
      renderFooter();
      render(true);
      if (MODE === 'live') {
        var t; state.store.onChange(function () { clearTimeout(t); t = setTimeout(refresh, 400); });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
        state.store.sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_OUT') { state.session = null; renderFooter(); } });
      }
    } catch (e) {
      app.innerHTML = '<div class="container"><div class="card empty" style="margin:40px 0"><div class="empty-icon">' + ICON.alert + '</div><h4>The clubhouse is closed</h4><p>' + esc(e.message) + '</p><p class="small">Check config.js and that supabase-schema.sql has been run. Preview with <a href="?demo">demo mode</a>.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>';
    }
  }
  boot();
})();
