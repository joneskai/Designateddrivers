/* Run: node tests/engine.test.js  — no dependencies required. */
'use strict';
const assert = require('assert');
const E = require('../engine.js');
const IDS = ['jones', 'fitz', 'pirie', 'forrest'];
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }
function season(results) {
  return E.generateSchedule(IDS, 12).map((s) => {
    const r = results[s.round];
    return { id: 'f' + s.round, round: s.round, date: r && r[2] || ('2026-01-' + String(s.round).padStart(2, '0')), teamA: s.teamA, teamB: s.teamB,
      status: r ? 'completed' : 'scheduled', scoreA: r ? r[0] : null, scoreB: r ? r[1] : null };
  });
}
const row = (t, id) => t.find((r) => r.id === id);

console.log('Schedule');
test('12 rounds, all four players in every fixture', () => {
  const s = E.generateSchedule(IDS, 12);
  assert.strictEqual(s.length, 12);
  s.forEach((f) => assert.deepStrictEqual(E.validateFixture(f, IDS), []));
});
test('each partnership occurs exactly four times', () => {
  const b = E.validateSeasonBalance(E.generateSchedule(IDS, 12));
  assert.ok(b.ok); assert.strictEqual(Object.keys(b.counts).length, 6);
  Object.values(b.counts).forEach((c) => assert.strictEqual(c, 4));
});
test('each team combination (2v2 split) occurs four times', () => {
  const counts = {};
  E.generateSchedule(IDS, 12).forEach((f) => { const k = [E.pairKey(...f.teamA), E.pairKey(...f.teamB)].sort().join(' v '); counts[k] = (counts[k] || 0) + 1; });
  assert.deepStrictEqual(Object.values(counts), [4, 4, 4]);
});
test('every player partners every other player four times', () => {
  const s = E.generateSchedule(IDS, 12);
  IDS.forEach((p) => IDS.filter((q) => q !== p).forEach((q) => {
    const n = s.filter((f) => (f.teamA.includes(p) && f.teamA.includes(q)) || (f.teamB.includes(p) && f.teamB.includes(q))).length;
    assert.strictEqual(n, 4, p + '+' + q);
  }));
});
test('invalid fixtures are rejected', () => {
  assert.ok(E.validateFixture({ teamA: ['jones', 'jones'], teamB: ['pirie', 'forrest'] }, IDS).length > 0);
  assert.ok(E.validateFixture({ teamA: ['jones'], teamB: ['pirie', 'forrest', 'fitz'] }, IDS).length > 0);
});

console.log('Scoring');
test('lowest gross strokes wins (78 beats 83)', () => {
  const o = E.outcome({ teamA: ['jones', 'fitz'], teamB: ['pirie', 'forrest'], scoreA: 78, scoreB: 83, status: 'completed' });
  assert.strictEqual(o.winner, 'A'); assert.strictEqual(o.margin, 5);
  assert.deepStrictEqual(o.points, { jones: 2, fitz: 2, pirie: 0, forrest: 0 });
});
test('team B can win too', () => {
  const o = E.outcome({ teamA: ['jones', 'fitz'], teamB: ['pirie', 'forrest'], scoreA: 90, scoreB: 70, status: 'completed' });
  assert.strictEqual(o.winner, 'B'); assert.deepStrictEqual(o.points, { jones: 0, fitz: 0, pirie: 2, forrest: 2 });
});
test('draw gives one point each', () => {
  const o = E.outcome({ teamA: ['jones', 'fitz'], teamB: ['pirie', 'forrest'], scoreA: 80, scoreB: 80, status: 'completed' });
  assert.strictEqual(o.winner, 'DRAW'); Object.values(o.points).forEach((p) => assert.strictEqual(p, 1));
});
test('gross strokes never leak into points', () => {
  const t = E.standings(IDS, season({ 1: [60, 99] }));
  assert.strictEqual(row(t, 'jones').points, 2); assert.strictEqual(row(t, 'pirie').points, 0);
  assert.strictEqual(row(t, 'jones').diff, 39);
});
test('score validation', () => {
  assert.deepStrictEqual(E.validateScores(78, 83), []);
  assert.ok(E.validateScores('', 83).length); assert.ok(E.validateScores(78.5, 83).length); assert.ok(E.validateScores(5, 83).length);
});
test('maximum individual points is 24', () => {
  const r = {}; for (let i = 1; i <= 12; i++) { const s = E.generateSchedule(IDS, 12)[i - 1]; r[i] = s.teamA.includes('jones') ? [70, 80] : [80, 70]; }
  const t = E.standings(IDS, season(r));
  assert.strictEqual(row(t, 'jones').points, 24); assert.strictEqual(row(t, 'jones').wins, 12);
  assert.strictEqual(row(t, 'jones').bestStreak, 12);
});

console.log('Standings & tiebreakers');
const demo = { 1: [79, 84], 2: [81, 85], 3: [82, 82], 4: [78, 83] };
test('demo season totals (7, 5, 3, 1)', () => {
  const t = E.standings(IDS, season(demo));
  assert.deepStrictEqual(t.map((r) => [r.id, r.points, r.wins, r.draws, r.losses]),
    [['jones', 7, 3, 1, 0], ['fitz', 5, 2, 1, 1], ['pirie', 3, 1, 1, 2], ['forrest', 1, 0, 1, 3]]);
});
test('tied points split on wins', () => {
  // R1 JF beat PFo, R2 JP v FFo draw, R3 JFo v FP draw
  const t = E.standings(IDS, season({ 1: [70, 80], 2: [75, 75], 3: [75, 75] }));
  // jones 4 (1W), fitz 4 (1W), pirie 2, forrest 2
  assert.strictEqual(row(t, 'jones').points, row(t, 'fitz').points);
  assert.strictEqual(row(t, 'jones').rank, 1); assert.strictEqual(row(t, 'fitz').rank, 1); // same wins and diff -> shared
  assert.ok(row(t, 'jones').shared);
});
test('equal points & wins split on stroke differential', () => {
  // R1: JF beat PFo by 1, R2: JP v FFo — FFo win by 9 -> fitz & forrest
  const t = E.standings(IDS, season({ 1: [70, 71], 2: [80, 71] }));
  // jones 2 pts (1W) diff +1-9 = -8; fitz 2 (1W) diff +1+9 = +10; forrest 2 (1W) diff -1+9=+8; pirie 0
  assert.deepStrictEqual(t.map((r) => r.id), ['fitz', 'forrest', 'jones', 'pirie']);
  assert.deepStrictEqual(t.map((r) => r.rank), [1, 2, 3, 4]);
});
test('identical records share a position', () => {
  const t = E.standings(IDS, season({}));
  t.forEach((r) => { assert.strictEqual(r.rank, 1); assert.ok(r.shared); });
});

console.log('Chart timeline');
test('cumulative series start at zero and follow results', () => {
  const tl = E.timeline(IDS, season(demo));
  assert.strictEqual(tl.lastRound, 4);
  assert.deepStrictEqual(tl.series.jones, [0, 2, 4, 5, 7]);
  assert.deepStrictEqual(tl.series.forrest, [0, 0, 0, 1, 1]);
});
test('no fictional future points are drawn', () => {
  const tl = E.timeline(IDS, season(demo));
  IDS.forEach((p) => assert.strictEqual(tl.series[p].length, 5));
});
test('editing an earlier result recalculates all later standings', () => {
  const edited = Object.assign({}, demo, { 1: [90, 70] }); // flip round 1
  const tl = E.timeline(IDS, season(edited));
  assert.deepStrictEqual(tl.series.jones, [0, 0, 2, 3, 5]);
  assert.deepStrictEqual(tl.series.pirie, [0, 2, 4, 5, 5]);
  const t = E.standings(IDS, season(edited));
  assert.strictEqual(row(t, 'pirie').points, 5); assert.strictEqual(row(t, 'fitz').points, 3);
});
test('movement compares with standings before the latest round', () => {
  const mv = E.movement(IDS, season({ 1: [70, 80], 2: [90, 70] }), IDS);
  // after R1: J,F 2 (rank1=), P,Fo 0; after R2 (FFo win): fitz 4 first
  assert.strictEqual(mv.fitz, 0); assert.ok(mv.forrest > 0); assert.ok(mv.jones < 0);
});

console.log('Partners, fines, records');
test('partner chemistry', () => {
  const ps = E.partnerStats('jones', IDS, season(demo));
  const fitz = ps.find((x) => x.partner === 'fitz');
  assert.strictEqual(fitz.played, 2); assert.strictEqual(fitz.wins, 2); assert.strictEqual(fitz.avgGross, 78.5);
  assert.strictEqual(ps.find((x) => x.partner === 'forrest').draws, 1);
});
test('fines are independent of championship points', () => {
  const fx = season(demo);
  const before = JSON.stringify(E.standings(IDS, fx));
  const fs = E.finesSummary(IDS, [{ playerId: 'jones', amount: 20, paid: false }, { playerId: 'pirie', amount: 5, paid: true }]);
  assert.strictEqual(fs.total, 25); assert.strictEqual(fs.paid, 5); assert.strictEqual(fs.outstanding, 20);
  assert.strictEqual(fs.topOffenders[0].id, 'jones');
  assert.strictEqual(JSON.stringify(E.standings(IDS, fx)), before);
});
test('fine ties are shared, not arbitrary', () => {
  const fs = E.finesSummary(IDS, [{ playerId: 'jones', amount: 5 }, { playerId: 'fitz', amount: 5 }]);
  assert.strictEqual(fs.topOffenders.length, 2);
});
test('no records are invented before results exist', () => {
  const r = E.records(IDS, [{ season: { totalRounds: 12 }, fixtures: season({}), fines: [], complete: false }]);
  ['mostPoints', 'mostWins', 'lowestGross', 'highestGross', 'biggestMargin', 'bestPartnership', 'mostFines', 'mostTitles'].forEach((k) => assert.strictEqual(r[k].length, 0, k));
});
test('records reflect real results', () => {
  const r = E.records(IDS, [{ season: { totalRounds: 12 }, fixtures: season(demo), fines: [], complete: false }]);
  assert.strictEqual(r.lowestGross[0].score, 78); assert.strictEqual(r.highestGross[0].score, 85);
  assert.strictEqual(r.biggestMargin[0].o.margin, 5); assert.strictEqual(r.biggestMargin.length, 2);
  assert.strictEqual(r.mostPoints[0].row.id, 'jones');
});
test('champion only crowned when all rounds are complete', () => {
  assert.deepStrictEqual(E.champions(IDS, season(demo), 12), []);
  const all = {}; for (let i = 1; i <= 12; i++) all[i] = [70, 80];
  assert.ok(E.champions(IDS, season(all), 12).length >= 1);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' — SOME FAILED' : ''));
