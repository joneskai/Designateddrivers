/* =====================================================================
   DESIGNATED DRIVERS — Championship engine
   Pure, deterministic calculations. No DOM, no network.
   Works in the browser (window.DDEngine) and in Node (require()).
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DDEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POINTS = { WIN: 2, DRAW: 1, LOSS: 0 };
  var MIN_SCORE = 18;   // a 9-hole Ambrose could be in the 30s; 18 is a hard floor
  var MAX_SCORE = 200;

  /* ---------- helpers ---------- */
  function pairKey(a, b) { return [a, b].sort().join('+'); }
  function sumBy(arr, fn) { return arr.reduce(function (s, x) { return s + fn(x); }, 0); }
  function byRound(a, b) { return a.round - b.round; }
  function isCompleted(f) {
    return f && f.status === 'completed' && Number.isFinite(f.scoreA) && Number.isFinite(f.scoreB);
  }

  /** The three possible 2v2 splits of four players, in a fixed, deterministic order. */
  function pairings(ids) {
    var p = ids.slice(0, 4);
    return [
      [[p[0], p[1]], [p[2], p[3]]],
      [[p[0], p[2]], [p[1], p[3]]],
      [[p[0], p[3]], [p[1], p[2]]]
    ];
  }

  /** Balanced schedule: each of the three splits rotates, so each occurs rounds/3 times. */
  function generateSchedule(ids, rounds) {
    rounds = rounds || 12;
    if (ids.length !== 4) throw new Error('A season needs exactly four players.');
    if (rounds % 3 !== 0) throw new Error('Rounds must be a multiple of 3 to keep partnerships balanced.');
    var splits = pairings(ids), out = [];
    for (var r = 1; r <= rounds; r++) {
      var s = splits[(r - 1) % 3];
      out.push({ round: r, teamA: s[0].slice(), teamB: s[1].slice() });
    }
    return out;
  }

  /** Validate that a fixture is a legal 2v2 involving all four players exactly once. */
  function validateFixture(f, ids) {
    var errs = [];
    var all = (f.teamA || []).concat(f.teamB || []);
    if ((f.teamA || []).length !== 2 || (f.teamB || []).length !== 2) errs.push('Each team must have exactly two players.');
    var uniq = Array.from(new Set(all));
    if (uniq.length !== 4) errs.push('All four players must play, each exactly once.');
    if (ids && uniq.some(function (p) { return ids.indexOf(p) === -1; })) errs.push('Unknown player in fixture.');
    return errs;
  }

  /** Each partnership must appear rounds/3 times (4 times in a 12-round season). */
  function validateSeasonBalance(fixtures) {
    var counts = {};
    fixtures.forEach(function (f) {
      counts[pairKey(f.teamA[0], f.teamA[1])] = (counts[pairKey(f.teamA[0], f.teamA[1])] || 0) + 1;
      counts[pairKey(f.teamB[0], f.teamB[1])] = (counts[pairKey(f.teamB[0], f.teamB[1])] || 0) + 1;
    });
    var expected = fixtures.length / 3;
    var keys = Object.keys(counts);
    var ok = keys.length === 6 && keys.every(function (k) { return counts[k] === expected; });
    return { ok: ok, counts: counts, expected: expected };
  }

  function validateScores(a, b) {
    var errs = [];
    [['Team A', a], ['Team B', b]].forEach(function (x) {
      var v = x[1];
      if (v === '' || v === null || v === undefined || !Number.isInteger(Number(v))) errs.push(x[0] + ' gross strokes must be a whole number.');
      else if (Number(v) < MIN_SCORE || Number(v) > MAX_SCORE) errs.push(x[0] + ' gross strokes must be between ' + MIN_SCORE + ' and ' + MAX_SCORE + '.');
    });
    return errs;
  }

  /** Lowest gross strokes wins. Returns null for an incomplete fixture. */
  function outcome(f) {
    if (!isCompleted(f)) return null;
    var a = f.scoreA, b = f.scoreB;
    var winner = a < b ? 'A' : b < a ? 'B' : 'DRAW';
    var pts = {};
    f.teamA.forEach(function (p) { pts[p] = winner === 'A' ? POINTS.WIN : winner === 'DRAW' ? POINTS.DRAW : POINTS.LOSS; });
    f.teamB.forEach(function (p) { pts[p] = winner === 'B' ? POINTS.WIN : winner === 'DRAW' ? POINTS.DRAW : POINTS.LOSS; });
    return {
      winner: winner,
      margin: Math.abs(a - b),
      winners: winner === 'A' ? f.teamA.slice() : winner === 'B' ? f.teamB.slice() : [],
      losers: winner === 'A' ? f.teamB.slice() : winner === 'B' ? f.teamA.slice() : [],
      points: pts
    };
  }

  /** Per-player view of one completed fixture. */
  function playerResult(f, pid) {
    var o = outcome(f);
    if (!o) return null;
    var onA = f.teamA.indexOf(pid) !== -1;
    if (!onA && f.teamB.indexOf(pid) === -1) return null;
    var own = onA ? f.scoreA : f.scoreB, opp = onA ? f.scoreB : f.scoreA;
    var partner = (onA ? f.teamA : f.teamB).filter(function (p) { return p !== pid; })[0];
    var res = o.winner === 'DRAW' ? 'D' : ((o.winner === 'A') === onA ? 'W' : 'L');
    return { fixture: f, result: res, points: o.points[pid], own: own, opp: opp, diff: opp - own, partner: partner, opponents: onA ? f.teamB : f.teamA };
  }

  function blankRow(pid) {
    return { id: pid, played: 0, wins: 0, draws: 0, losses: 0, points: 0, diff: 0, grossTotal: 0, best: null, worst: null, form: [], streak: 0, bestStreak: 0 };
  }

  /** Standings from a list of fixtures (only completed ones count). Deterministic order. */
  function standings(playerIds, fixtures, playerOrder) {
    var rows = {};
    playerIds.forEach(function (p) { rows[p] = blankRow(p); });
    fixtures.filter(isCompleted).slice().sort(byRound).forEach(function (f) {
      playerIds.forEach(function (p) {
        var r = playerResult(f, p);
        if (!r) return;
        var row = rows[p];
        row.played++; row.points += r.points; row.diff += r.diff; row.grossTotal += r.own;
        if (r.result === 'W') { row.wins++; row.streak++; row.bestStreak = Math.max(row.bestStreak, row.streak); }
        else { row.streak = 0; }
        if (r.result === 'D') row.draws++;
        if (r.result === 'L') row.losses++;
        row.best = row.best === null ? r.own : Math.min(row.best, r.own);
        row.worst = row.worst === null ? r.own : Math.max(row.worst, r.own);
        row.form.push(r.result);
      });
    });
    var order = playerOrder || playerIds;
    var list = playerIds.map(function (p) { return rows[p]; });
    list.forEach(function (r) {
      r.avgGross = r.played ? r.grossTotal / r.played : null;
      r.winPct = r.played ? (r.wins / r.played) * 100 : null;
    });
    list.sort(function (a, b) {
      return (b.points - a.points) || (b.wins - a.wins) || (b.diff - a.diff) || (order.indexOf(a.id) - order.indexOf(b.id));
    });
    // shared positions when points, wins and differential are all level
    list.forEach(function (r, i) {
      var prev = list[i - 1];
      r.rank = prev && prev.points === r.points && prev.wins === r.wins && prev.diff === r.diff ? prev.rank : i + 1;
    });
    list.forEach(function (r) {
      r.shared = list.filter(function (x) { return x.rank === r.rank; }).length > 1;
    });
    return list;
  }

  /** Cumulative points after each round number 0..lastCompletedRound (carry forward gaps). */
  function timeline(playerIds, fixtures) {
    var done = fixtures.filter(isCompleted);
    var last = done.reduce(function (m, f) { return Math.max(m, f.round); }, 0);
    var series = {};
    playerIds.forEach(function (p) { series[p] = [0]; });
    for (var r = 1; r <= last; r++) {
      var f = done.filter(function (x) { return x.round === r; })[0];
      var o = f ? outcome(f) : null;
      playerIds.forEach(function (p) {
        var prev = series[p][r - 1];
        series[p].push(prev + (o && o.points[p] !== undefined ? o.points[p] : 0));
      });
    }
    return { lastRound: last, series: series };
  }

  /** The most recently played completed fixture (date, then round number). */
  function latestFixture(fixtures) {
    var done = fixtures.filter(isCompleted).slice();
    done.sort(function (a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      return b.round - a.round;
    });
    return done[0] || null;
  }

  /** Rank movement: compare against standings without the latest fixture. */
  function movement(playerIds, fixtures, order) {
    var latest = latestFixture(fixtures);
    var now = standings(playerIds, fixtures, order);
    var mv = {};
    if (!latest || fixtures.filter(isCompleted).length < 2) {
      now.forEach(function (r) { mv[r.id] = 0; });
      return mv;
    }
    var before = standings(playerIds, fixtures.filter(function (f) { return f.id !== latest.id; }), order);
    now.forEach(function (r) {
      var b = before.filter(function (x) { return x.id === r.id; })[0];
      mv[r.id] = b.rank - r.rank; // positive = moved up
    });
    return mv;
  }

  /** Partner chemistry for one player. */
  function partnerStats(pid, playerIds, fixtures) {
    return playerIds.filter(function (p) { return p !== pid; }).map(function (partner) {
      var games = fixtures.filter(isCompleted).map(function (f) { return playerResult(f, pid); })
        .filter(function (r) { return r && r.partner === partner; });
      var w = games.filter(function (g) { return g.result === 'W'; }).length;
      var d = games.filter(function (g) { return g.result === 'D'; }).length;
      return {
        partner: partner, played: games.length, wins: w, draws: d, losses: games.length - w - d,
        winPct: games.length ? (w / games.length) * 100 : null,
        avgGross: games.length ? sumBy(games, function (g) { return g.own; }) / games.length : null,
        points: sumBy(games, function (g) { return g.points; })
      };
    });
  }

  /** All 6 partnerships across a set of fixtures (each team = one partnership appearance). */
  function partnershipTable(playerIds, fixtures) {
    var map = {};
    for (var i = 0; i < playerIds.length; i++) for (var j = i + 1; j < playerIds.length; j++) {
      map[pairKey(playerIds[i], playerIds[j])] = { pair: [playerIds[i], playerIds[j]].sort(), played: 0, wins: 0, draws: 0, losses: 0, gross: 0, diff: 0 };
    }
    fixtures.filter(isCompleted).forEach(function (f) {
      var o = outcome(f);
      [['A', f.teamA, f.scoreA, f.scoreB], ['B', f.teamB, f.scoreB, f.scoreA]].forEach(function (t) {
        var k = pairKey(t[1][0], t[1][1]); var row = map[k];
        if (!row) return;
        row.played++; row.gross += t[2]; row.diff += t[3] - t[2];
        if (o.winner === 'DRAW') row.draws++; else if (o.winner === t[0]) row.wins++; else row.losses++;
      });
    });
    return Object.keys(map).map(function (k) {
      var r = map[k];
      r.winPct = r.played ? (r.wins / r.played) * 100 : null;
      r.avgGross = r.played ? r.gross / r.played : null;
      r.points = r.wins * 2 + r.draws;
      return r;
    });
  }

  /** Fines summary. Fines never touch championship points. */
  function finesSummary(playerIds, fines) {
    var per = {};
    playerIds.forEach(function (p) { per[p] = { id: p, total: 0, paid: 0, outstanding: 0, count: 0 }; });
    var total = 0, paid = 0;
    fines.forEach(function (f) {
      var amt = Number(f.amount) || 0;
      total += amt; if (f.paid) paid += amt;
      var row = per[f.playerId]; if (!row) return;
      row.total += amt; row.count++;
      if (f.paid) row.paid += amt; else row.outstanding += amt;
    });
    var rows = playerIds.map(function (p) { return per[p]; }).sort(function (a, b) { return (b.total - a.total) || (b.count - a.count); });
    return { total: total, paid: paid, outstanding: total - paid, count: fines.length, rows: rows, topOffenders: leaders(rows, function (r) { return r.total; }) };
  }

  /** All items sharing the maximum (positive) value. Ties are kept — never pick arbitrarily. */
  function leaders(items, fn, opts) {
    opts = opts || {};
    var vals = items.map(fn).filter(function (v) { return v !== null && v !== undefined && !Number.isNaN(v); });
    if (!vals.length) return [];
    var best = opts.min ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
    if (!opts.allowZero && !opts.min && best <= 0) return [];
    return items.filter(function (x) { return fn(x) === best; });
  }

  /** Champion(s) of a season — only when every round has been completed. */
  function champions(playerIds, fixtures, totalRounds) {
    var done = fixtures.filter(isCompleted);
    if (!done.length || done.length < totalRounds) return [];
    return standings(playerIds, fixtures).filter(function (r) { return r.rank === 1; }).map(function (r) { return r.id; });
  }

  /**
   * Records across seasons.
   * seasons: [{ season, fixtures, fines, complete }]
   * Returns null values where no real data exists — nothing is invented.
   */
  function records(playerIds, seasons) {
    var out = {};
    var allFix = [];
    var seasonRows = [];
    seasons.forEach(function (s) {
      var fx = s.fixtures.filter(isCompleted);
      fx.forEach(function (f) { allFix.push({ f: f, season: s.season }); });
      if (fx.length) standings(playerIds, s.fixtures).forEach(function (r) { seasonRows.push({ row: r, season: s.season }); });
    });

    out.mostPoints = seasonRows.length ? leaders(seasonRows, function (x) { return x.row.points; }) : [];
    out.mostWins = seasonRows.length ? leaders(seasonRows, function (x) { return x.row.wins; }) : [];
    out.longestStreak = seasonRows.length ? leaders(seasonRows, function (x) { return x.row.bestStreak; }) : [];

    var teams = [];
    allFix.forEach(function (x) {
      teams.push({ team: x.f.teamA, score: x.f.scoreA, fixture: x.f, season: x.season });
      teams.push({ team: x.f.teamB, score: x.f.scoreB, fixture: x.f, season: x.season });
    });
    out.lowestGross = teams.length ? leaders(teams, function (t) { return t.score; }, { min: true }) : [];
    out.highestGross = teams.length ? leaders(teams, function (t) { return t.score; }) : [];

    var wins = allFix.map(function (x) { var o = outcome(x.f); return { fixture: x.f, season: x.season, o: o }; }).filter(function (x) { return x.o.winner !== 'DRAW'; });
    out.biggestMargin = wins.length ? leaders(wins, function (x) { return x.o.margin; }) : [];

    var pt = partnershipTable(playerIds, allFix.map(function (x) { return x.f; })).filter(function (r) { return r.played > 0; });
    if (pt.length) {
      var score = function (r) { return r.winPct * 1000 + r.points * 10 + r.diff / 100; };
      out.bestPartnership = leaders(pt, function (r) { return r.winPct; }, { allowZero: true });
      out.bestPartnership = leaders(out.bestPartnership, score, { allowZero: true });
      out.worstPartnership = leaders(pt, function (r) { return r.winPct; }, { min: true });
      out.worstPartnership = leaders(out.worstPartnership, score, { min: true });
      if (pt.length < 2) out.worstPartnership = [];
    } else { out.bestPartnership = []; out.worstPartnership = []; }

    var allFines = [];
    seasons.forEach(function (s) { allFines = allFines.concat(s.fines || []); });
    var fs = finesSummary(playerIds, allFines);
    out.mostFines = fs.topOffenders;

    var titles = {};
    playerIds.forEach(function (p) { titles[p] = 0; });
    out.hall = [];
    seasons.forEach(function (s) {
      if (!s.complete) return;
      var ch = champions(playerIds, s.fixtures, s.season.totalRounds || 12);
      ch.forEach(function (p) { titles[p]++; });
      out.hall.push({ season: s.season, champions: ch, table: standings(playerIds, s.fixtures) });
    });
    out.titles = titles;
    out.mostTitles = leaders(playerIds.map(function (p) { return { id: p, titles: titles[p] }; }), function (x) { return x.titles; });
    return out;
  }

  return {
    POINTS: POINTS, MIN_SCORE: MIN_SCORE, MAX_SCORE: MAX_SCORE,
    pairKey: pairKey, pairings: pairings, generateSchedule: generateSchedule,
    validateFixture: validateFixture, validateSeasonBalance: validateSeasonBalance, validateScores: validateScores,
    isCompleted: isCompleted, outcome: outcome, playerResult: playerResult,
    standings: standings, timeline: timeline, latestFixture: latestFixture, movement: movement,
    partnerStats: partnerStats, partnershipTable: partnershipTable, finesSummary: finesSummary,
    leaders: leaders, champions: champions, records: records
  };
});
