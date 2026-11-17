/* =====================================================================
   DESIGNATED DRIVERS — Tee Sheet logic
   Pure, deterministic scheduling rules: slot ranking, response progress,
   time-zone handling, WhatsApp messages and calendar (.ics) export.
   No DOM, no network. Browser: window.DDTee — Node: require().
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDTee = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_TZ = 'Australia/Perth';
  var DEFAULT_DURATION = 270; // minutes — four and a half hours
  var STATUSES = ['available', 'maybe', 'unavailable'];
  var WINDOWS = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', anytime: 'Anytime', time: 'Set time' };
  var WINDOW_START = { morning: '07:30', midday: '11:00', afternoon: '13:00', anytime: '08:00' };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* ---------- calendar dates (plain YYYY-MM-DD, never shifted by a time zone) ---------- */
  function parts(iso) { var p = String(iso).slice(0, 10).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function weekday(iso) { var p = parts(iso); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function validDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    var p = parts(iso), d = new Date(Date.UTC(p.y, p.m - 1, p.d));
    return d.getUTCFullYear() === p.y && d.getUTCMonth() === p.m - 1 && d.getUTCDate() === p.d;
  }
  function validTime(t) { return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(t || '')); }
  /** "Sunday 13 December" */
  function longDate(iso, withYear) { if (!validDate(iso)) return 'Date TBC'; var p = parts(iso); return DAYS[weekday(iso)] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (withYear ? ' ' + p.y : ''); }
  /** "Sun 13 Dec" */
  function shortDate(iso) { if (!validDate(iso)) return 'Date TBC'; var p = parts(iso); return DAYS[weekday(iso)].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m - 1].slice(0, 3); }
  /** "07:40" -> "7:40 AM" */
  function time12(t) {
    if (!validTime(t)) return '';
    var h = +t.slice(0, 2), m = t.slice(3, 5);
    return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function windowLabel(slot) { return slot.window === 'time' && slot.startTime ? time12(slot.startTime) : (WINDOWS[slot.window] || 'Anytime'); }
  /** "SAT 05 DEC — MORNING" */
  function slotLabel(slot) { var p = parts(slot.date); return (DAYS[weekday(slot.date)].slice(0, 3) + ' ' + pad2(p.d) + ' ' + MONTHS[p.m - 1].slice(0, 3) + ' — ' + windowLabel(slot)).toUpperCase(); }
  /** A sensible tee-off suggestion for a slot when the organiser books the course. */
  function suggestedStart(slot) { return slot.window === 'time' && slot.startTime ? slot.startTime.slice(0, 5) : (WINDOW_START[slot.window] || '08:00'); }

  /* ---------- time zones ---------- */
  function tzOffsetMs(utcMs, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var o = {}; f.formatToParts(new Date(utcMs)).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - Math.floor(utcMs / 1000) * 1000;
  }
  /** Wall-clock date + time in a named zone -> the exact UTC instant (a Date). */
  function zonedToUtc(dateIso, time, tz) {
    var p = parts(dateIso), t = String(time || '00:00');
    var wall = Date.UTC(p.y, p.m - 1, p.d, +t.slice(0, 2), +t.slice(3, 5), 0);
    var guess = wall - tzOffsetMs(wall, tz || DEFAULT_TZ);
    return new Date(wall - tzOffsetMs(guess, tz || DEFAULT_TZ));
  }
  /** UTC instant -> { date:'YYYY-MM-DD', time:'HH:MM' } on the wall clock of a zone. */
  function utcToZoned(instant, tz) {
    var ms = new Date(instant).getTime();
    var d = new Date(ms + tzOffsetMs(ms, tz || DEFAULT_TZ));
    return { date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()), time: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) };
  }
  /** "Fri 4 Dec, 6:00 PM" in the competition time zone. */
  function formatInstant(instant, tz) { if (!instant) return ''; var z = utcToZoned(instant, tz); return shortDate(z.date) + ', ' + time12(z.time); }
  function validTimeZone(tz) { try { new Intl.DateTimeFormat('en-AU', { timeZone: tz }); return true; } catch (e) { return false; } }

  /* ---------- slot classification & ranking ---------- */
  /**
   * tier 1 PERFECT   — four Available
   * tier 2 STRONG    — three Available, one Maybe
   * tier 3 POSSIBLE  — two Available, two Maybe
   * tier 4 other combinations with no explicit Unavailable (incl. missing replies)
   * tier 5 at least one Unavailable
   * A missing reply is never counted as Available.
   */
  function classifySlot(slot, playerIds) {
    var votes = slot.votes || {};
    var c = { availableIds: [], maybeIds: [], unavailableIds: [], missingIds: [] };
    playerIds.forEach(function (p) {
      var v = votes[p];
      if (v === 'available') c.availableIds.push(p);
      else if (v === 'maybe') c.maybeIds.push(p);
      else if (v === 'unavailable') c.unavailableIds.push(p);
      else c.missingIds.push(p);
    });
    c.a = c.availableIds.length; c.m = c.maybeIds.length; c.u = c.unavailableIds.length; c.missing = c.missingIds.length;
    c.total = playerIds.length;
    c.complete = c.missing === 0;
    if (c.u > 0) { c.tier = 5; c.key = 'unavailable'; c.label = 'Doesn’t work'; }
    else if (c.a === c.total && c.total > 0) { c.tier = 1; c.key = 'perfect'; c.label = 'All four available'; }
    else if (c.complete && c.a === c.total - 1 && c.m === 1) { c.tier = 2; c.key = 'strong'; c.label = 'Likely to work'; }
    else if (c.complete && c.a === c.total - 2 && c.m === 2) { c.tier = 3; c.key = 'possible'; c.label = 'Possible'; }
    else if (c.complete) { c.tier = 4; c.key = 'possible'; c.label = 'Possible'; }
    else { c.tier = 4; c.key = 'incomplete'; c.label = 'Awaiting ' + (c.missing === 1 ? '1 reply' : c.missing + ' replies'); }
    c.unanimous = c.tier === 1;
    c.lockable = c.u === 0;               // a date with an explicit "Unavailable" can never be locked in
    c.needsConfirmation = c.maybeIds.concat(c.missingIds); // these players must explicitly confirm once a date is agreed
    return c;
  }
  function chronoCompare(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    var ta = suggestedStart(a), tb = suggestedStart(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  }
  function chronological(slots) { return slots.slice().sort(chronoCompare); }
  /** Best first: tier, then number of Available, then chronological. Preferred flags never affect ranking. */
  function rankSlots(slots, playerIds) {
    return slots.map(function (s) { return { slot: s, c: classifySlot(s, playerIds) }; }).sort(function (x, y) {
      return (x.c.tier - y.c.tier) || (y.c.a - x.c.a) || chronoCompare(x.slot, y.slot);
    });
  }

  /** A player has responded only once they have voted on EVERY active slot. */
  function progress(poll, playerIds) {
    var slots = poll.slots || [];
    var responded = [], outstanding = [];
    playerIds.forEach(function (p) {
      var done = slots.length > 0 && slots.every(function (s) { return STATUSES.indexOf((s.votes || {})[p]) !== -1; });
      (done ? responded : outstanding).push(p);
    });
    return { responded: responded, outstanding: outstanding, count: responded.length, total: playerIds.length, complete: outstanding.length === 0 };
  }
  /** Everyone has answered and every option has at least one "Unavailable". */
  function noCommonDate(poll, playerIds) {
    var slots = poll.slots || [];
    return slots.length > 0 && progress(poll, playerIds).complete && slots.every(function (s) { return classifySlot(s, playerIds).u > 0; });
  }
  /** Players who still have to say "I'm in" for an agreed date. */
  function pendingAgreement(poll, playerIds) {
    var ok = (poll.agreements || []).map(function (a) { return a.playerId; });
    return playerIds.filter(function (p) { return ok.indexOf(p) === -1; });
  }
  function deadlinePassed(poll, now) { return !!poll.deadline && new Date(poll.deadline).getTime() <= (now ? new Date(now).getTime() : Date.now()); }
  /** Voting only closes at the deadline when the organiser asked for that rule. */
  function votingOpen(poll, now) { return poll.status === 'polling' && !(poll.closeAtDeadline && deadlinePassed(poll, now)); }
  /** The one active (non-cancelled) poll for a fixture, if any. */
  function activePoll(polls, fixtureId) { return (polls || []).filter(function (p) { return p.fixtureId === fixtureId && p.status !== 'cancelled'; })[0] || null; }

  /* ---------- WhatsApp / share messages (nothing is ever sent automatically) ---------- */
  function roundTag(round) { return 'ROUND ' + pad2(round); }
  function pollMessage(o) {
    var lines = ['🏌️ DESIGNATED DRIVERS — ' + roundTag(o.round), 'Time to lock in the next round.'];
    lines.push(o.deadlineText ? 'Submit your availability by ' + o.deadlineText + '.' : 'Submit your availability.');
    lines.push(o.responded + ' of ' + o.total + ' players have responded.');
    lines.push('Vote here:', o.url);
    return lines.join('\n');
  }
  function agreedMessage(o) {
    return ['🏌️ DESIGNATED DRIVERS — ' + roundTag(o.round), 'Date agreed: ' + o.dateText + (o.windowText ? ' (' + o.windowText + ')' : '') + '.',
      o.pendingNames && o.pendingNames.length ? 'Still to confirm: ' + o.pendingNames.join(', ') + '.' : 'All four are in. Course booking to follow.', o.url].join('\n');
  }
  function confirmedMessage(o) {
    return ['🏌️ DESIGNATED DRIVERS — ' + roundTag(o.round), 'We’re locked in.', '📍 ' + o.course, '📅 ' + longDate(o.teeDate), '⏰ ' + time12(o.teeTime),
      o.names.join(' · '), 'See the fixture:', o.url].join('\n');
  }
  function reminderMessage(o) {
    var first = o.last
      ? o.name + ' — you’re the last one to submit availability for Round ' + pad2(o.round) + '. Get onto it.'
      : o.name + ' — we still need your availability for Round ' + pad2(o.round) + '. Get onto it.';
    return first + '\n' + o.url;
  }
  function whatsappUrl(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

  /* ---------- calendar export (.ics, RFC 5545) ---------- */
  function icsEscape(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsStamp(d) { return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z'; }
  function utf8Len(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function icsFold(line) { // lines must not exceed 75 octets
    var out = [], cur = '', len = 0;
    Array.from(line).forEach(function (ch) {
      var n = utf8Len(ch);
      if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
      cur += ch; len += n;
    });
    out.push(cur);
    return out.join('\r\n ');
  }
  /**
   * The tee-off wall-clock time in the competition zone is converted to an exact
   * UTC instant, so every calendar app shows the right local time with no shift.
   */
  function buildIcs(o) {
    var tz = o.timezone || DEFAULT_TZ;
    var start = zonedToUtc(o.teeDate, o.teeTime, tz);
    var end = new Date(start.getTime() + (o.durationMinutes || DEFAULT_DURATION) * 60000);
    var title = 'Designated Drivers — Round ' + pad2(o.round);
    var desc = [title, '2-person Ambrose' + (o.names ? ' · ' + o.names.join(', ') : ''), 'Tee-off ' + time12(o.teeTime) + ' (' + tz + ')',
      o.bookingRef ? 'Booking reference: ' + o.bookingRef : '', o.notes || '', o.url || ''].filter(Boolean).join('\n');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Designated Drivers//Tee Sheet//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:' + tz,
      'BEGIN:VEVENT', 'UID:' + icsEscape(o.uid || ('round-' + o.round)) + '@designated-drivers', 'DTSTAMP:' + icsStamp(o.now ? new Date(o.now) : new Date()),
      'DTSTART:' + icsStamp(start), 'DTEND:' + icsStamp(end), 'SUMMARY:' + icsEscape(title), 'LOCATION:' + icsEscape(o.course || ''), 'DESCRIPTION:' + icsEscape(desc)];
    if (o.url) lines.push('URL:' + o.url);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  /** Validate a proposed slot before it is saved. */
  function validateSlot(s) {
    var errs = [];
    if (!validDate(s.date)) errs.push('Choose a valid date.');
    if (!WINDOWS[s.window]) errs.push('Choose a time window.');
    if (s.window === 'time' && !validTime(s.startTime)) errs.push('Enter a start time.');
    return errs;
  }
  function slotKey(s) { return s.date + '|' + s.window + '|' + (s.window === 'time' ? String(s.startTime || '').slice(0, 5) : ''); }

  return {
    DEFAULT_TZ: DEFAULT_TZ, DEFAULT_DURATION: DEFAULT_DURATION, STATUSES: STATUSES, WINDOWS: WINDOWS,
    validDate: validDate, validTime: validTime, longDate: longDate, shortDate: shortDate, time12: time12, windowLabel: windowLabel, slotLabel: slotLabel, suggestedStart: suggestedStart,
    zonedToUtc: zonedToUtc, utcToZoned: utcToZoned, formatInstant: formatInstant, validTimeZone: validTimeZone,
    classifySlot: classifySlot, rankSlots: rankSlots, chronological: chronological, progress: progress, noCommonDate: noCommonDate,
    pendingAgreement: pendingAgreement, deadlinePassed: deadlinePassed, votingOpen: votingOpen, activePoll: activePoll,
    pollMessage: pollMessage, agreedMessage: agreedMessage, confirmedMessage: confirmedMessage, reminderMessage: reminderMessage, whatsappUrl: whatsappUrl,
    buildIcs: buildIcs, validateSlot: validateSlot, slotKey: slotKey
  };
});
