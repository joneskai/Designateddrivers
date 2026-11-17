/* Run: node tests/teesheet.test.js — no dependencies. Tee Sheet scheduling logic. */
'use strict';
const assert = require('assert');
const T = require('../teesheet.js');
const E = require('../engine.js');
const IDS = ['jones', 'fitz', 'pirie', 'forrest'];
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }
const slot = (id, date, votes, window, startTime) => ({ id, date, window: window || 'morning', startTime: startTime || null, votes });
const v = (j, f, p, fo) => { const o = {}; [j, f, p, fo].forEach((x, i) => { if (x) o[IDS[i]] = { A: 'available', M: 'maybe', U: 'unavailable' }[x]; }); return o; };

console.log('Ranking');
test('1. four Available = perfect date, "All four available"', () => {
  const c = T.classifySlot(slot('a', '2026-12-05', v('A', 'A', 'A', 'A')), IDS);
  assert.strictEqual(c.tier, 1); assert.strictEqual(c.key, 'perfect'); assert.strictEqual(c.label, 'All four available'); assert.ok(c.unanimous);
});
test('2. three Available + one Maybe = strong date, "Likely to work"', () => {
  const c = T.classifySlot(slot('a', '2026-12-05', v('A', 'A', 'M', 'A')), IDS);
  assert.strictEqual(c.tier, 2); assert.strictEqual(c.label, 'Likely to work'); assert.ok(!c.unanimous);
  assert.deepStrictEqual(c.needsConfirmation, ['pirie']);
});
test('two Available + two Maybe = possible', () => {
  const c = T.classifySlot(slot('a', '2026-12-05', v('A', 'M', 'M', 'A')), IDS);
  assert.strictEqual(c.tier, 3); assert.strictEqual(c.label, 'Possible');
});
test('other all-answered combinations without Unavailable rank fourth', () => {
  assert.strictEqual(T.classifySlot(slot('a', '2026-12-05', v('A', 'M', 'M', 'M')), IDS).tier, 4);
  assert.strictEqual(T.classifySlot(slot('a', '2026-12-05', v('M', 'M', 'M', 'M')), IDS).tier, 4);
});
test('3. an Unavailable vote is never unanimous and cannot be locked in', () => {
  const c = T.classifySlot(slot('a', '2026-12-05', v('A', 'A', 'A', 'U')), IDS);
  assert.strictEqual(c.tier, 5); assert.ok(!c.unanimous); assert.ok(!c.lockable); assert.strictEqual(c.key, 'unavailable');
});
test('4. a missing reply is not treated as Available', () => {
  const c = T.classifySlot(slot('a', '2026-12-05', v('A', 'A', 'A', null)), IDS);
  assert.strictEqual(c.a, 3); assert.strictEqual(c.missing, 1); assert.ok(!c.unanimous); assert.notStrictEqual(c.tier, 1);
  assert.strictEqual(c.key, 'incomplete'); assert.deepStrictEqual(c.missingIds, ['forrest']); assert.deepStrictEqual(c.needsConfirmation, ['forrest']);
  assert.ok(!/all four/i.test(c.label));
});
test('ranking order: tier, then Available count, then chronological', () => {
  const slots = [
    slot('u', '2026-12-01', v('A', 'A', 'A', 'U')),
    slot('poss', '2026-12-02', v('A', 'A', 'M', 'M')),
    slot('strongLate', '2026-12-20', v('A', 'A', 'A', 'M')),
    slot('strongEarly', '2026-12-10', v('M', 'A', 'A', 'A')),
    slot('perfect', '2026-12-25', v('A', 'A', 'A', 'A')),
    slot('inc3', '2026-12-03', v('A', 'A', 'A', null)),
    slot('other', '2026-12-04', v('A', 'M', 'M', 'M'))
  ];
  assert.deepStrictEqual(T.rankSlots(slots, IDS).map((x) => x.slot.id), ['perfect', 'strongEarly', 'strongLate', 'poss', 'inc3', 'other', 'u']);
  assert.deepStrictEqual(T.chronological(slots).map((s) => s.id), ['u', 'poss', 'inc3', 'other', 'strongEarly', 'strongLate', 'perfect']);
});
test('5. editing a vote re-ranks the dates', () => {
  const a = slot('a', '2026-12-05', v('A', 'A', 'A', 'M')), b = slot('b', '2026-12-06', v('A', 'A', 'M', 'M'));
  assert.strictEqual(T.rankSlots([a, b], IDS)[0].slot.id, 'a');
  a.votes.forrest = 'unavailable'; b.votes.pirie = 'available'; b.votes.forrest = 'available';
  const r = T.rankSlots([a, b], IDS);
  assert.strictEqual(r[0].slot.id, 'b'); assert.strictEqual(r[0].c.tier, 1); assert.strictEqual(r[1].c.tier, 5);
});
test('preferred flag never changes the ranking', () => {
  const a = slot('a', '2026-12-05', v('A', 'A', 'A', 'A')), b = Object.assign(slot('b', '2026-12-06', v('A', 'A', 'M', 'M')), { preferred: true });
  assert.strictEqual(T.rankSlots([b, a], IDS)[0].slot.id, 'a');
});

console.log('Progress');
const poll = (slots, extra) => Object.assign({ status: 'polling', slots, agreements: [] }, extra || {});
test('a player has responded only after voting on every slot', () => {
  const p = poll([slot('a', '2026-12-05', v('A', 'A', 'A', 'A')), slot('b', '2026-12-06', v('A', 'M', 'U', null))]);
  const pr = T.progress(p, IDS);
  assert.strictEqual(pr.count, 3); assert.deepStrictEqual(pr.outstanding, ['forrest']); assert.ok(!pr.complete);
});
test('adding a new slot makes everyone outstanding again', () => {
  const p = poll([slot('a', '2026-12-05', v('A', 'A', 'A', 'A'))]);
  assert.ok(T.progress(p, IDS).complete);
  p.slots.push(slot('b', '2026-12-12', {}));
  assert.strictEqual(T.progress(p, IDS).count, 0);
});
test('"no common date" only when everyone answered and every date has an Unavailable', () => {
  assert.ok(T.noCommonDate(poll([slot('a', '2026-12-05', v('A', 'A', 'A', 'U')), slot('b', '2026-12-06', v('U', 'A', 'A', 'A'))]), IDS));
  assert.ok(!T.noCommonDate(poll([slot('a', '2026-12-05', v('A', 'A', 'A', 'U')), slot('b', '2026-12-06', v('M', 'A', 'A', 'A'))]), IDS));
  assert.ok(!T.noCommonDate(poll([slot('a', '2026-12-05', v('A', 'A', 'A', 'U')), slot('b', '2026-12-06', v('U', 'A', 'A', null))]), IDS));
});
test('pending agreement lists who still has to confirm', () => {
  const p = poll([], { status: 'agreed', agreements: [{ playerId: 'jones' }, { playerId: 'fitz' }, { playerId: 'forrest' }] });
  assert.deepStrictEqual(T.pendingAgreement(p, IDS), ['pirie']);
});
test('deadline does not close voting unless the rule is on and the time has passed', () => {
  const past = '2026-01-01T00:00:00Z', now = '2026-06-01T00:00:00Z';
  assert.ok(T.votingOpen({ status: 'polling', deadline: past, closeAtDeadline: false }, now));
  assert.ok(!T.votingOpen({ status: 'polling', deadline: past, closeAtDeadline: true }, now));
  assert.ok(T.votingOpen({ status: 'polling', deadline: '2026-12-01T00:00:00Z', closeAtDeadline: true }, now));
  assert.ok(!T.votingOpen({ status: 'agreed' }, now));
});
test('only one active poll per round is recognised; cancelled polls are history', () => {
  const polls = [{ id: 1, fixtureId: 'f5', status: 'cancelled' }, { id: 2, fixtureId: 'f5', status: 'polling' }, { id: 3, fixtureId: 'f6', status: 'cancelled' }];
  assert.strictEqual(T.activePoll(polls, 'f5').id, 2); assert.strictEqual(T.activePoll(polls, 'f6'), null);
});

console.log('Dates & time zones');
test('12. Australian date and time formatting', () => {
  assert.strictEqual(T.longDate('2026-12-13'), 'Sunday 13 December');
  assert.strictEqual(T.shortDate('2026-12-05'), 'Sat 5 Dec');
  assert.strictEqual(T.slotLabel({ date: '2026-12-05', window: 'morning' }), 'SAT 05 DEC — MORNING');
  assert.strictEqual(T.slotLabel({ date: '2026-12-13', window: 'time', startTime: '07:40' }), 'SUN 13 DEC — 7:40 AM');
  assert.strictEqual(T.time12('07:40'), '7:40 AM'); assert.strictEqual(T.time12('12:05'), '12:05 PM'); assert.strictEqual(T.time12('00:10'), '12:10 AM'); assert.strictEqual(T.time12('15:00:00'), '3:00 PM');
});
test('plain dates never shift with the viewer’s time zone', () => {
  const saved = process.env.TZ;
  ['America/Los_Angeles', 'Pacific/Auckland', 'UTC'].forEach((z) => { process.env.TZ = z; assert.strictEqual(T.longDate('2026-12-13'), 'Sunday 13 December'); });
  process.env.TZ = saved;
});
test('Perth wall-clock time converts to the right UTC instant (UTC+8, no daylight saving)', () => {
  assert.strictEqual(T.zonedToUtc('2026-12-13', '07:40', 'Australia/Perth').toISOString(), '2026-12-12T23:40:00.000Z');
  assert.strictEqual(T.zonedToUtc('2026-06-13', '07:40', 'Australia/Perth').toISOString(), '2026-06-12T23:40:00.000Z');
});
test('a configurable zone with daylight saving is handled (Sydney)', () => {
  assert.strictEqual(T.zonedToUtc('2026-12-13', '07:40', 'Australia/Sydney').toISOString(), '2026-12-12T20:40:00.000Z'); // AEDT +11
  assert.strictEqual(T.zonedToUtc('2026-06-13', '07:40', 'Australia/Sydney').toISOString(), '2026-06-12T21:40:00.000Z'); // AEST +10
});
test('deadline instants display in the competition zone, round-trip exactly', () => {
  const inst = T.zonedToUtc('2026-12-04', '18:00', 'Australia/Perth');
  assert.strictEqual(T.formatInstant(inst.toISOString(), 'Australia/Perth'), 'Fri 4 Dec, 6:00 PM');
  assert.deepStrictEqual(T.utcToZoned(inst, 'Australia/Perth'), { date: '2026-12-04', time: '18:00' });
});
test('slot validation', () => {
  assert.deepStrictEqual(T.validateSlot({ date: '2026-12-05', window: 'morning' }), []);
  assert.ok(T.validateSlot({ date: '2026-02-30', window: 'morning' }).length);
  assert.ok(T.validateSlot({ date: '2026-12-05', window: 'time', startTime: '' }).length);
  assert.ok(T.validateSlot({ date: '2026-12-05', window: 'brunch' }).length);
});

console.log('WhatsApp');
const URL_ = 'https://designated-drivers.vercel.app/#/tee-sheet';
test('13. poll share message and link', () => {
  const m = T.pollMessage({ round: 5, deadlineText: 'Fri 4 Dec, 6:00 PM', responded: 3, total: 4, url: URL_ });
  assert.strictEqual(m, '🏌️ DESIGNATED DRIVERS — ROUND 05\nTime to lock in the next round.\nSubmit your availability by Fri 4 Dec, 6:00 PM.\n3 of 4 players have responded.\nVote here:\n' + URL_);
  const wa = T.whatsappUrl(m);
  assert.ok(wa.startsWith('https://wa.me/?text='));
  assert.strictEqual(decodeURIComponent(wa.split('?text=')[1]), m);          // encodes and decodes losslessly
  assert.ok(!/[\n# ]/.test(wa.split('?text=')[1]));                           // newlines, spaces and # are escaped
});
test('13. confirmed tee time message', () => {
  const m = T.confirmedMessage({ round: 5, course: 'Wembley Golf Course', teeDate: '2026-12-13', teeTime: '07:40', names: ['Jones', 'Fitz', 'Pirie', 'Forrest'], url: URL_ });
  assert.strictEqual(m, '🏌️ DESIGNATED DRIVERS — ROUND 05\nWe’re locked in.\n📍 Wembley Golf Course\n📅 Sunday 13 December\n⏰ 7:40 AM\nJones · Fitz · Pirie · Forrest\nSee the fixture:\n' + URL_);
});
test('reminder message names the outstanding player', () => {
  assert.strictEqual(T.reminderMessage({ name: 'Forrest', round: 5, last: true, url: URL_ }), 'Forrest — you’re the last one to submit availability for Round 05. Get onto it.\n' + URL_);
  assert.ok(/^Fitz — we still need your availability for Round 05/.test(T.reminderMessage({ name: 'Fitz', round: 5, last: false, url: URL_ })));
});

console.log('Calendar export');
const ics = T.buildIcs({ uid: 'poll-1', round: 5, teeDate: '2026-12-13', teeTime: '07:40', timezone: 'Australia/Perth', durationMinutes: 270, course: 'Wembley Golf Course, Floreat', names: ['Jones', 'Fitz', 'Pirie', 'Forrest'], bookingRef: 'WGC-4471', url: URL_, now: '2026-11-17T00:00:00Z' });
test('14. tee-off 7:40 AM Perth = 23:40 UTC the previous day; default 4.5 h duration', () => {
  assert.ok(ics.includes('DTSTART:20261212T234000Z'));
  assert.ok(ics.includes('DTEND:20261213T041000Z'));
});
test('valid iCalendar structure', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')); assert.ok(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:Designated Drivers — Round 05'));
  assert.ok(ics.includes('LOCATION:Wembley Golf Course\\, Floreat'));        // commas escaped
  assert.ok(ics.includes('UID:poll-1@designated-drivers')); assert.ok(ics.includes('DTSTAMP:20261117T000000Z'));
  assert.ok(ics.includes('URL:' + URL_)); assert.ok(ics.includes('X-WR-TIMEZONE:Australia/Perth'));
  assert.ok(!/[^\r]\n/.test(ics), 'CRLF line endings only');
  ics.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l, 'utf8') <= 75, 'line too long: ' + l));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('Booking reference: WGC-4471')); assert.ok(unfolded.includes('Tee-off 7:40 AM (Australia/Perth)'));
});
test('configurable duration', () => {
  const five = T.buildIcs({ round: 5, teeDate: '2026-12-13', teeTime: '07:40', timezone: 'Australia/Perth', durationMinutes: 300, course: 'X' });
  assert.ok(five.includes('DTEND:20261213T044000Z'));
});

console.log('Championship untouched');
test('15. scheduling data has no effect on standings', () => {
  const fx = E.generateSchedule(IDS, 12).map((s) => ({ id: 'f' + s.round, round: s.round, teamA: s.teamA, teamB: s.teamB, status: s.round === 1 ? 'completed' : 'scheduled', scoreA: s.round === 1 ? 78 : null, scoreB: s.round === 1 ? 83 : null }));
  const before = JSON.stringify(E.standings(IDS, fx));
  fx[4].teeTime = '07:40'; fx[4].date = '2026-12-13'; fx[4].course = 'Wembley';
  assert.strictEqual(JSON.stringify(E.standings(IDS, fx)), before);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' — SOME FAILED' : ''));
