/* =====================================================================
   DESIGNATED DRIVERS — Tee Time rules
   Pure, deterministic scheduling logic: the availability window that opens
   after each round, availability bits, and ranking the best overlaps.
   No DOM, no network. Browser: window.DDTee — Node: require().

   All dates are plain 'YYYY-MM-DD' calendar dates (Perth wall dates) and all
   date maths uses UTC arithmetic on those strings, so nothing ever shifts a
   day because of a time zone.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDTee = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'Australia/Perth';
  var GAP_DAYS = 21;          // minimum spacing after the previous round
  var INITIAL_WEEKS = 4;      // weekends shown at first
  var EXTEND_BY = 2;          // weekends added each time the group extends
  var MAX_WEEKS = 26;

  // Friday, Saturday, Sunday × five windows. Bit = day * 5 + slot.
  var DAYS = [{ offset: 0, short: 'Fri', long: 'Friday' }, { offset: 1, short: 'Sat', long: 'Saturday' }, { offset: 2, short: 'Sun', long: 'Sunday' }];
  var SLOTS = [
    { key: 'early_am', label: 'Early AM', start: '07:00' },
    { key: 'late_am', label: 'Late AM', start: '09:30' },
    { key: 'lunch', label: 'Lunch', start: '12:00' },
    { key: 'early_pm', label: 'Early PM', start: '13:30' },
    { key: 'twilight', label: 'Twilight', start: '16:00' }
  ];
  var FULL_MASK = (1 << (DAYS.length * SLOTS.length)) - 1;   // 32767
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- calendar dates ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toUtc(iso) { var p = String(iso).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fromUtc(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(iso, n) { return fromUtc(toUtc(iso) + n * 86400000); }
  function dow(iso) { return new Date(toUtc(iso)).getUTCDay(); }               // 0 Sun … 5 Fri, 6 Sat
  function validDate(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && fromUtc(toUtc(iso)) === iso; }
  function isFriday(iso) { return validDate(iso) && dow(iso) === 5; }
  function fridayOnOrAfter(iso) { return addDays(iso, (5 - dow(iso) + 7) % 7); }
  /** Today's date in the competition time zone (default Australia/Perth). */
  function today(tz, now) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(now ? new Date(now) : new Date());
  }
  /** Current wall-clock time 'HH:MM' in the competition time zone. */
  function nowTime(tz, now) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return f.format(now ? new Date(now) : new Date());
  }
  /** "Sat 9 Jan" */
  function shortDate(iso) { if (!validDate(iso)) return 'Date TBC'; var p = iso.split('-'); return WEEKDAYS[dow(iso)] + ' ' + (+p[2]) + ' ' + MONTHS[+p[1] - 1]; }
  /** "Fri 1 – Sun 3 Jan" or "Fri 29 Jan – Sun 1 Feb" */
  function weekendLabel(friday) {
    var sun = addDays(friday, 2), a = friday.split('-'), b = sun.split('-');
    return 'Fri ' + (+a[2]) + (a[1] === b[1] ? '' : ' ' + MONTHS[+a[1] - 1]) + ' – Sun ' + (+b[2]) + ' ' + MONTHS[+b[1] - 1];
  }

  /* ---------- the availability window ---------- */
  /**
   * The weekend availability opens after a round: the Friday of the weekend in
   * which the 21-day mark falls, or the next Friday if that mark is Mon–Thu.
   * e.g. round on Sun 13 Dec 2026 -> mark Sun 3 Jan -> opens Fri 1 Jan 2027.
   */
  function eligibleFriday(lastPlayed) {
    if (!validDate(lastPlayed)) return null;
    return fridayOnOrAfter(addDays(lastPlayed, GAP_DAYS - 2));
  }
  /** The current weekend's Friday if today is Fri–Sun, otherwise next Friday. */
  function currentFriday(todayIso) { var d = dow(todayIso); return d === 6 ? addDays(todayIso, -1) : d === 0 ? addDays(todayIso, -2) : fridayOnOrAfter(todayIso); }
  /**
   * Weekends to show for the next fixture. Starts at the eligible Friday, but
   * never in the past: if those weekends have gone by, the window slides on, so
   * scheduling can never get stuck.
   */
  function windowFor(o) {
    var t = o.today, eligible = eligibleFriday(o.lastPlayed), now = currentFriday(t);
    var start = eligible && eligible > now ? eligible : now;
    var weeks = Math.max(INITIAL_WEEKS, Math.min(MAX_WEEKS, o.weeks || INITIAL_WEEKS));
    var weekends = [];
    for (var i = 0; i < weeks; i++) weekends.push(addDays(start, i * 7));
    return { start: start, eligible: eligible, slid: !!(eligible && eligible < now), weekends: weekends, weeks: weeks };
  }

  /* ---------- availability bits ---------- */
  function bit(day, slot) { return 1 << (day * SLOTS.length + slot); }
  function dayBits(day) { var m = 0; for (var s = 0; s < SLOTS.length; s++) m |= bit(day, s); return m; }
  function has(mask, day, slot) { return ((mask || 0) & bit(day, slot)) !== 0; }
  /** Apply set/clear bits (clear wins), as the database does. */
  function apply(mask, set, clear) { return ((mask || 0) | (set || 0)) & ~(clear || 0) & FULL_MASK; }

  /**
   * avail: { playerId: { 'YYYY-MM-DD' (Friday): mask } } — a weekend key that
   * exists means the player has answered that weekend (unticked = can't play);
   * a missing key means no response yet, which is never treated as a "no".
   */
  function cellStatus(avail, playerId, friday, day, slot) {
    var w = avail[playerId] || {};
    if (!(friday in w)) return 'missing';
    return has(w[friday], day, slot) ? 'yes' : 'no';
  }
  function cells(o) {
    var out = [];
    o.weekends.forEach(function (fri) {
      DAYS.forEach(function (d, di) {
        var date = addDays(fri, d.offset);
        if (date < o.today) return;                               // never suggest the past
        SLOTS.forEach(function (s, si) {
          if (date === o.today && o.now && s.start <= o.now) return;   // that window has already started today
          var c = { weekend: fri, day: di, slot: si, date: date, label: s.label, yes: [], no: [], missing: [] };
          o.players.forEach(function (p) { c[cellStatus(o.avail, p, fri, di, si)].push(p); });
          out.push(c);
        });
      });
    });
    return out;
  }
  function prefRank(o, si) { var p = o.preferred || []; var i = p.indexOf(SLOTS[si].key); return i === -1 ? p.length : i; }
  /**
   * Best overlaps. All-four times first (earliest date, then preferred window,
   * then earliest window); then alternatives by most available, fewest
   * explicit "can't", earliest. Only times where at least two can play count.
   */
  function overlaps(o) {
    var all = o.players.length;
    var list = cells(o).filter(function (c) { return c.yes.length >= Math.min(2, all); });
    list.sort(function (a, b) {
      var fa = a.yes.length === all, fb = b.yes.length === all;
      if (fa !== fb) return fa ? -1 : 1;
      if (!fa && a.yes.length !== b.yes.length) return b.yes.length - a.yes.length;
      if (!fa && a.no.length !== b.no.length) return a.no.length - b.no.length;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (prefRank(o, a.slot) - prefRank(o, b.slot)) || (a.slot - b.slot);
    });
    return list;
  }
  /** The recommended time: only ever a time all four can make. */
  function best(o) { var l = overlaps(o); return l[0] && l[0].yes.length === o.players.length ? l[0] : null; }

  /** Who has answered which of the shown weekends. */
  function responses(o) {
    return o.players.map(function (p) {
      var w = o.avail[p] || {};
      var answered = o.weekends.filter(function (f) { return f in w; });
      return { id: p, answered: answered.length, total: o.weekends.length, complete: answered.length === o.weekends.length };
    });
  }
  /** Why there's no all-four time yet: still waiting on people, or genuinely no overlap. */
  function blocker(o) {
    if (best(o)) return null;
    var waiting = responses(o).filter(function (r) { return !r.complete; }).map(function (r) { return r.id; });
    return waiting.length ? { kind: 'waiting', players: waiting } : { kind: 'no-overlap', players: [] };
  }

  /** Proposal confirmations. responses: { playerId: 'yes' | 'no' } */
  function proposalState(players, resp) {
    resp = resp || {};
    var st = { confirmed: [], declined: [], waiting: [] };
    players.forEach(function (p) { (resp[p] === 'yes' ? st.confirmed : resp[p] === 'no' ? st.declined : st.waiting).push(p); });
    st.allIn = st.confirmed.length === players.length;
    return st;
  }

  return {
    TZ: TZ, GAP_DAYS: GAP_DAYS, INITIAL_WEEKS: INITIAL_WEEKS, EXTEND_BY: EXTEND_BY, MAX_WEEKS: MAX_WEEKS, DAYS: DAYS, SLOTS: SLOTS, FULL_MASK: FULL_MASK,
    addDays: addDays, dow: dow, validDate: validDate, isFriday: isFriday, fridayOnOrAfter: fridayOnOrAfter, today: today,
    shortDate: shortDate, weekendLabel: weekendLabel, nowTime: nowTime,
    eligibleFriday: eligibleFriday, currentFriday: currentFriday, windowFor: windowFor,
    bit: bit, dayBits: dayBits, has: has, apply: apply,
    cellStatus: cellStatus, overlaps: overlaps, best: best, responses: responses, blocker: blocker, proposalState: proposalState
  };
});
