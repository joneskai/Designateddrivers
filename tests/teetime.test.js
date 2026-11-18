/* Run: node tests/teetime.test.js — no dependencies. Tee Time scheduling rules. */
'use strict';
const assert = require('assert');
const T = require('../teetime.js');
const P = ['jones', 'fitz', 'pirie', 'forrest'];
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }
const SAT = 1, SUN = 2, FRI = 0, EARLY = 0, LATE = 1, TWI = 4;
const mask = (...cells) => cells.reduce((m, [d, s]) => m | T.bit(d, s), 0);

console.log('The 21-day window');
test('worked example: round on Sun 13 Dec 2026 opens Fri 1 Jan 2027', () => {
  assert.strictEqual(T.eligibleFriday('2026-12-13'), '2027-01-01');
  const w = T.windowFor({ lastPlayed: '2026-12-13', today: '2026-12-14' });
  assert.deepStrictEqual(w.weekends, ['2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22']);
});
test('every weekday of the previous round gives the right Friday', () => {
  // 21-day mark falls on Fri/Sat/Sun -> that weekend; Mon–Thu -> the following Friday
  const cases = { '2026-12-07': '2027-01-01', '2026-12-08': '2027-01-01', '2026-12-09': '2027-01-01', '2026-12-10': '2027-01-01',
    '2026-12-11': '2027-01-01', '2026-12-12': '2027-01-01', '2026-12-13': '2027-01-01', '2026-12-14': '2027-01-08' };
  Object.entries(cases).forEach(([played, fri]) => {
    const got = T.eligibleFriday(played);
    assert.strictEqual(got, fri, played); assert.ok(T.isFriday(got));
    // the 21-day mark always falls inside the first weekend shown, or before it
    assert.ok(T.addDays(played, 21) <= T.addDays(got, 2), played);
  });
});
test('month and year boundaries, leap years', () => {
  assert.strictEqual(T.eligibleFriday('2027-01-31'), '2027-02-19');  // Sun -> mark Sun 21 Feb -> Fri 19 Feb
  assert.strictEqual(T.eligibleFriday('2027-02-07'), '2027-02-26');
  assert.strictEqual(T.eligibleFriday('2028-02-06'), '2028-02-25');  // Sun; 2028 is a leap year, mark Sun 27 Feb
  assert.strictEqual(T.eligibleFriday('2028-02-13'), '2028-03-03');  // mark Sun 5 Mar
  assert.strictEqual(T.eligibleFriday('2026-11-30'), '2026-12-25');  // Mon -> mark Mon 21 Dec -> Fri 25 Dec
  assert.strictEqual(T.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(T.addDays('2027-12-31', 1), '2028-01-01');
});
test('first round of a season (no previous round) starts this weekend', () => {
  assert.strictEqual(T.windowFor({ lastPlayed: null, today: '2026-11-18' }).start, '2026-11-20');   // Wed -> Fri
  assert.strictEqual(T.windowFor({ lastPlayed: null, today: '2026-11-21' }).start, '2026-11-20');   // Sat -> this weekend
  assert.strictEqual(T.windowFor({ lastPlayed: null, today: '2026-11-22' }).start, '2026-11-20');   // Sun -> this weekend
});
test('if the eligible weekends have gone by, the window slides forward (never stuck)', () => {
  const w = T.windowFor({ lastPlayed: '2026-12-13', today: '2027-02-10' });
  assert.strictEqual(w.start, '2027-02-12'); assert.ok(w.slid);
});
test('extending adds weekends and keeps the same start', () => {
  const a = T.windowFor({ lastPlayed: '2026-12-13', today: '2026-12-14', weeks: 4 });
  const b = T.windowFor({ lastPlayed: '2026-12-13', today: '2026-12-14', weeks: 6 });
  assert.deepStrictEqual(b.weekends.slice(0, 4), a.weekends); assert.strictEqual(b.weekends.length, 6);
  assert.strictEqual(b.weekends[5], '2027-02-05');
});
test('today is the Perth date, not the UTC date', () => {
  assert.strictEqual(T.today('Australia/Perth', '2027-01-01T23:30:00Z'), '2027-01-02');
  assert.strictEqual(T.today('Australia/Perth', '2027-01-01T15:59:00Z'), '2027-01-01');
  assert.strictEqual(T.today('Australia/Perth', '2027-01-01T16:00:00Z'), '2027-01-02');
});
test('labels', () => {
  assert.strictEqual(T.weekendLabel('2027-01-01'), 'Fri 1 – Sun 3 Jan');
  assert.strictEqual(T.weekendLabel('2027-01-29'), 'Fri 29 – Sun 31 Jan');
  assert.strictEqual(T.weekendLabel('2027-04-30'), 'Fri 30 Apr – Sun 2 May');
  assert.strictEqual(T.shortDate('2027-01-09'), 'Sat 9 Jan');
});

console.log('Bits');
test('fifteen cells per weekend; clear wins over set', () => {
  assert.strictEqual(T.FULL_MASK, 32767);
  assert.strictEqual(T.dayBits(SAT), 0b11111 << 5);
  assert.strictEqual(T.apply(0, T.bit(SAT, EARLY), 0), T.bit(SAT, EARLY));
  assert.strictEqual(T.apply(T.FULL_MASK, 0, T.dayBits(FRI)), T.dayBits(SAT) | T.dayBits(SUN));
  assert.strictEqual(T.apply(0, T.bit(SUN, TWI), T.bit(SUN, TWI)), 0);
});

console.log('Best overlaps');
const W = T.windowFor({ lastPlayed: '2026-12-13', today: '2026-12-14' }).weekends;
const base = (avail, today) => ({ players: P, weekends: W, avail, today: today || '2026-12-14' });
test('all four available -> recommended, 4/4', () => {
  const m = mask([SAT, EARLY], [SUN, LATE]);
  const avail = { jones: { '2027-01-08': m }, fitz: { '2027-01-08': m }, pirie: { '2027-01-08': m }, forrest: { '2027-01-08': m } };
  const b = T.best(base(avail));
  assert.strictEqual(b.date, '2027-01-09'); assert.strictEqual(b.label, 'Early AM'); assert.strictEqual(b.yes.length, 4);
  const top = T.overlaps(base(avail)).slice(0, 2).map((c) => c.date + ' ' + c.label);
  assert.deepStrictEqual(top, ['2027-01-09 Early AM', '2027-01-10 Late AM']);
});
test('only three available -> shown as an alternative, never recommended', () => {
  const m = mask([SAT, EARLY]);
  const avail = { jones: { '2027-01-08': m }, fitz: { '2027-01-08': m }, pirie: { '2027-01-08': m }, forrest: { '2027-01-08': 0 } };
  assert.strictEqual(T.best(base(avail)), null);
  const top = T.overlaps(base(avail))[0];
  assert.strictEqual(top.yes.length, 3); assert.deepStrictEqual(top.no, ['forrest']);
  assert.deepStrictEqual(T.blocker(base(avail)), { kind: 'waiting', players: ['jones', 'fitz', 'pirie', 'forrest'] });
});
test('a player who has not answered is "missing", not "no"', () => {
  const m = mask([SAT, EARLY]);
  const avail = { jones: { '2027-01-08': m }, fitz: { '2027-01-08': m }, pirie: { '2027-01-08': m } };
  const c = T.overlaps(base(avail))[0];
  assert.deepStrictEqual(c.missing, ['forrest']); assert.deepStrictEqual(c.no, []);
  assert.strictEqual(T.cellStatus(avail, 'forrest', '2027-01-08', SAT, EARLY), 'missing');
  assert.strictEqual(T.cellStatus(avail, 'jones', '2027-01-08', SUN, EARLY), 'no');
  assert.strictEqual(T.best(base(avail)), null);
});
test('3/4 with one missing ranks above 3/4 with one explicit no', () => {
  const avail = {
    jones: { '2027-01-01': mask([FRI, TWI]), '2027-01-15': mask([FRI, TWI]) },
    fitz: { '2027-01-01': mask([FRI, TWI]), '2027-01-15': mask([FRI, TWI]) },
    pirie: { '2027-01-01': mask([FRI, TWI]), '2027-01-15': mask([FRI, TWI]) },
    forrest: { '2027-01-01': 0 }
  };
  const top = T.overlaps(base(avail)).map((c) => c.date);
  assert.deepStrictEqual(top.slice(0, 2), ['2027-01-15', '2027-01-01']);
});
test('no overlap in the first four weekends -> blocker says so once everyone has answered', () => {
  const avail = {};
  P.forEach((p, i) => { avail[p] = {}; W.forEach((w) => { avail[p][w] = T.bit(i % 3, i); }); });
  assert.strictEqual(T.best(base(avail)), null);
  assert.deepStrictEqual(T.blocker(base(avail)), { kind: 'no-overlap', players: [] });
  // the group extends by two weekends and a match appears in week 5
  const W6 = T.windowFor({ lastPlayed: '2026-12-13', today: '2026-12-14', weeks: 6 }).weekends;
  P.forEach((p) => { avail[p][W6[4]] = mask([SAT, LATE]); });
  const b = T.best({ players: P, weekends: W6, avail, today: '2026-12-14' });
  assert.strictEqual(b.date, '2027-01-30'); assert.strictEqual(b.label, 'Late AM');
});
test('editing availability changes the recommendation', () => {
  const m = mask([SAT, EARLY], [SUN, EARLY]);
  const avail = { jones: { '2027-01-01': m }, fitz: { '2027-01-01': m }, pirie: { '2027-01-01': m }, forrest: { '2027-01-01': m } };
  assert.strictEqual(T.best(base(avail)).date, '2027-01-02');
  avail.pirie['2027-01-01'] = T.apply(m, 0, T.bit(SAT, EARLY));
  assert.strictEqual(T.best(base(avail)).date, '2027-01-03');
});
test('days already past are never suggested', () => {
  const m = T.FULL_MASK; const avail = {}; P.forEach((p) => { avail[p] = { '2027-01-01': m }; });
  assert.strictEqual(T.best(base(avail, '2027-01-02')).date, '2027-01-02');
});
test('preferred windows break ties on the same day', () => {
  const m = mask([SAT, EARLY], [SAT, TWI]); const avail = {}; P.forEach((p) => { avail[p] = { '2027-01-01': m }; });
  assert.strictEqual(T.best(base(avail)).label, 'Early AM');
  assert.strictEqual(T.best(Object.assign(base(avail), { preferred: ['twilight'] })).label, 'Twilight');
});

console.log('Proposals');
test('confirmed / declined / waiting', () => {
  const st = T.proposalState(P, { jones: 'yes', fitz: 'yes', pirie: 'no' });
  assert.deepStrictEqual(st, { confirmed: ['jones', 'fitz'], declined: ['pirie'], waiting: ['forrest'], allIn: false });
  assert.ok(T.proposalState(P, { jones: 'yes', fitz: 'yes', pirie: 'yes', forrest: 'yes' }).allIn);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' — SOME FAILED' : ''));
