/*
 * Prospect metrics: pure functions, no fetching. Input is a player's games (box score
 * totals plus the team's totals for each game); output is plain numbers.
 *
 * All positions
 *   games, PPG            Volume of fantasy production (PPR by default). The baseline.
 *   RPI-adjusted PPG      Yards and TDs scaled up vs strong opponents (see model-config).
 *                         Production against good teams is harder, so it counts more.
 *   age (Sept 1)          Younger producers hit more often: doing it at 19–20 against
 *                         older players is a stronger signal than doing it at 23.
 *   Power 4 splits        PPG vs Power 4 opponents vs everyone else. Checks that the
 *                         production holds up against NFL-caliber defenses.
 *
 * WR / TE
 *   YPTPA                 Receiving yards per TEAM pass attempt. Normalizes for how
 *                         much a team throws; the most predictive single college WR/TE
 *                         stat in public prospect models.
 *   weighted dominator    0.8 x share of team rec yards + 0.2 x share of team rec TDs.
 *                         Market share: how much of the passing game runs through him.
 *   breakout              Dominator >= 20% this season (with age). Early breakouts
 *                         correlate with NFL success.
 *
 * RB
 *   scrimmage yds / team play   Rushing + receiving yards per team offensive play.
 *                               Team-normalized workload and efficiency in one number.
 *   YPC, rush share             Efficiency and share of the team's rushing yards.
 *   receiving share             Share of team receiving yards. Pass-game work is what
 *                               keeps RBs on the field (and scoring) in the NFL.
 *
 * QB
 *   completion %, Y/A, AY/A     Accuracy and efficiency. AY/A = (yds + 20*TD - 45*INT)
 *                               / att, which prices in TDs and turnovers.
 *   TD:INT                      Ball security.
 *   rushing share of points     Rushing is what separates fantasy QBs. Archetype:
 *                               under 10% Pocket, 10–25% Balanced, over 25% Dual-threat.
 *
 * Team plays = pass attempts + rush attempts (college box scores count sacks as rushes).
 * Any ratio with a zero denominator is null, never 0 or NaN.
 */
import { EMPTY_TOTALS, addTotals } from "./totals";
import { fantasyPoints } from "./scoring";

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
export const ratio = (a, b) => (b > 0 ? a / b : null);
const share = (part, whole) => (whole > 0 ? Math.max(0, part) / whole : null);

// ---------------------------------------------------------------------------
// Opponent strength

export function opponentTier(rank, config) {
  if (rank == null) return null;
  return config.opponentTiers.find((t) => rank <= t.upToRank) ?? null;
}

// RPI multiplier: yards and TDs scale; receptions, INTs and fumbles don't.
export function adjust(t, m) {
  return {
    ...t,
    passYds: t.passYds * m,
    passTD: t.passTD * m,
    rushYds: t.rushYds * m,
    rushTD: t.rushTD * m,
    recYds: t.recYds * m,
    recTD: t.recTD * m,
  };
}

export function isPower4(game, config) {
  if (config.power4.teams.includes(game.opponent)) return true;
  return game.opponentConferenceId != null && config.power4.conferenceIds.includes(String(game.opponentConferenceId));
}

// ---------------------------------------------------------------------------
// Age

// Age in years (1 decimal) on Sept 1 of the season. dob: "YYYY-MM-DD". Null if missing.
export function ageOn(dob, season) {
  if (!dob || !season) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const ref = new Date(Date.UTC(season, 8, 1));
  return round((ref - birth) / (365.25 * 24 * 3600 * 1000));
}

// ---------------------------------------------------------------------------
// Position metrics from season (or single-game) totals

export function weightedDominator(t, team) {
  if (!team) return null;
  const yd = share(t.recYds, team.recYds);
  const td = share(t.recTD, team.recTD);
  if (yd == null) return null;
  // No team receiving TDs yet: the yards share carries the whole metric.
  return td == null ? yd : 0.8 * yd + 0.2 * td;
}

export function receiverMetrics(t, team) {
  return {
    yptpa: team ? ratio(t.recYds, team.passAtt) : null,
    weightedDominator: weightedDominator(t, team),
    recYdsShare: team ? share(t.recYds, team.recYds) : null,
    recTdShare: team ? share(t.recTD, team.recTD) : null,
  };
}

export function rbMetrics(t, team, blend = { rush: 0.6, rec: 0.4 }) {
  const plays = team ? team.passAtt + team.rushAtt : 0;
  const rushShare = team ? share(t.rushYds, team.rushYds) : null;
  const recShare = team ? share(t.recYds, team.recYds) : null;
  const rbShare =
    rushShare == null && recShare == null
      ? null
      : (blend.rush * (rushShare ?? 0) + blend.rec * (recShare ?? 0)) /
        ((rushShare == null ? 0 : blend.rush) + (recShare == null ? 0 : blend.rec));
  return {
    scrimmagePerTeamPlay: ratio(t.rushYds + t.recYds, plays),
    ypc: ratio(t.rushYds, t.rushAtt),
    rushShare,
    recShare,
    rbShare,
  };
}

export function qbMetrics(t, scoring = "ppr", archetypes) {
  const points = fantasyPoints(t, scoring);
  const rushPoints = t.rushYds / 10 + t.rushTD * 6;
  const rushShareOfPoints = points > 0 ? Math.max(0, rushPoints) / points : null;
  const archetype =
    rushShareOfPoints == null || !archetypes
      ? null
      : archetypes.find((a) => rushShareOfPoints < a.below)?.label ?? null;
  return {
    cmpPct: ratio(t.passCmp, t.passAtt),
    ypa: ratio(t.passYds, t.passAtt),
    aya: ratio(t.passYds + 20 * t.passTD - 45 * t.int, t.passAtt),
    tdInt: t.passAtt > 0 ? `${t.passTD}:${t.int}` : null,
    rushShareOfPoints,
    archetype,
  };
}

// ---------------------------------------------------------------------------
// Games

// One game with raw and RPI-adjusted points, Power 4 tag, and per-game metrics.
export function gamePerformance(w, config, scoring = "ppr") {
  const tier = opponentTier(w.oppRank, config);
  const mult = tier?.multiplier ?? 1;
  const adjTotals = adjust(w.totals, mult);
  const team = w.teamTotals ?? null;
  return {
    ...w,
    mult,
    tierLabel: tier?.label ?? null,
    power4: isPower4(w, config),
    raw: fantasyPoints(w.totals, scoring),
    adj: fantasyPoints(adjTotals, scoring),
    adjTotals,
    usage: gameUsage(w.totals, team, w.pos),
    yptpa: team ? ratio(w.totals.recYds, team.passAtt) : null,
    scrimmagePerTeamPlay: team ? ratio(w.totals.rushYds + w.totals.recYds, team.passAtt + team.rushAtt) : null,
    aya: ratio(w.totals.passYds + 20 * w.totals.passTD - 45 * w.totals.int, w.totals.passAtt),
  };
}

// Single-game market share for the Top performances "Usage" view.
export function gameUsage(t, team, pos) {
  if (!team) return { dominator: null, opportunity: null, opportunityLabel: null };
  if (pos === "QB") {
    return { dominator: share(t.rushYds, team.rushYds), opportunity: share(t.rushAtt, team.rushAtt), opportunityLabel: "of team carries" };
  }
  if (pos === "RB") {
    const scrimShare = share(t.rushYds + t.recYds, team.rushYds + team.recYds);
    const tdShare = share(t.rushTD + t.recTD, team.rushTD + team.recTD);
    return {
      dominator: scrimShare == null ? null : tdShare == null ? scrimShare : 0.8 * scrimShare + 0.2 * tdShare,
      opportunity: share(t.rushAtt + t.rec, team.rushAtt + team.rec),
      opportunityLabel: "of team touches",
    };
  }
  return { dominator: weightedDominator(t, team), opportunity: share(t.rec, team.rec), opportunityLabel: "of team catches" };
}

function splitStats(games) {
  const n = games.length;
  return {
    games: n,
    ppg: n ? round(games.reduce((s, g) => s + g.raw, 0) / n) : null,
    adjPpg: n ? round(games.reduce((s, g) => s + g.adj, 0) / n) : null,
  };
}

// ---------------------------------------------------------------------------
// Season metrics for one prospect

export function seasonMetrics(row, config, scoring = "ppr") {
  const games = (row.weeks ?? []).map((w) => gamePerformance({ ...w, pos: row.pos }, config, scoring));
  const gp = games.length;
  const totals = games.reduce((s, g) => addTotals(s, g.totals), { ...EMPTY_TOTALS });

  // Shares and team-normalized stats use only games where we have the team's totals.
  const withTeam = games.filter((g) => g.teamTotals);
  const playerWithTeam = withTeam.reduce((s, g) => addTotals(s, g.totals), { ...EMPTY_TOTALS });
  const team = withTeam.length ? withTeam.reduce((s, g) => addTotals(s, g.teamTotals), { ...EMPTY_TOTALS }) : null;

  const age = ageOn(row.dob, row.season);
  const receiver = receiverMetrics(playerWithTeam, team);
  const rb = rbMetrics(playerWithTeam, team, config.rbShareBlend);
  const qb = qbMetrics(totals, scoring, config.qbArchetypes);

  const breakout =
    (row.pos === "WR" || row.pos === "TE") && receiver.weightedDominator != null
      ? { flag: receiver.weightedDominator >= config.breakoutDominator, age }
      : { flag: false, age: null };

  return {
    games: gp,
    totals,
    teamTotals: team,
    ppg: gp ? round(games.reduce((s, g) => s + g.raw, 0) / gp) : null,
    adjPpg: gp ? round(games.reduce((s, g) => s + g.adj, 0) / gp) : null,
    age,
    splits: {
      power4: splitStats(games.filter((g) => g.power4)),
      other: splitStats(games.filter((g) => !g.power4)),
    },
    ...receiver,
    ...rb,
    ...qb,
    breakout,
    // Denominators, so the model can shrink small samples.
    volume: {
      yptpa: team?.passAtt ?? 0,
      scrimmagePerTeamPlay: team ? team.passAtt + team.rushAtt : 0,
      aya: totals.passAtt,
    },
    gamesDetail: games,
  };
}

// ---------------------------------------------------------------------------
// Career: prior seasons plus the current one
//
//   breakout season     The first season a player hit the market-share bar (WR 20%
//                       weighted dominator; RB/TE 15%). Breaking out in your 1st or 2nd
//                       active season, as a teenager against older players, is one of
//                       the strongest early signals in prospect models.
//   prior production    PPG in the most recent prior season (4+ games). Keeps injured or
//                       slow-starting prospects from vanishing, and steadies small
//                       early-season samples.

// Market share for a season, by position (null for QBs).
export function seasonDominator(t, team, pos) {
  if (!team) return null;
  if (pos === "WR" || pos === "TE") return weightedDominator(t, team);
  if (pos === "RB") {
    const yd = share(t.rushYds + t.recYds, team.rushYds + team.recYds);
    const td = share(t.rushTD + t.recTD, team.rushTD + team.recTD);
    return yd == null ? null : td == null ? yd : 0.8 * yd + 0.2 * td;
  }
  return null;
}

export function careerMetrics(row, current, config, scoring = "ppr") {
  const prior = (row.career ?? []).filter((s) => s.games > 0 && s.year < row.season);
  const seasons = prior.map((s) => ({
    year: s.year,
    team: s.team,
    games: s.games,
    totals: s.totals,
    ppg: round(fantasyPoints(s.totals, scoring) / s.games),
    dominator: seasonDominator(s.totals, s.teamTotals, row.pos),
    current: false,
  }));
  // The current season joins the breakout check once it's a real sample.
  if (current.games > 0) {
    seasons.push({
      year: row.season,
      team: row.team,
      games: current.games,
      totals: current.totals,
      ppg: current.ppg,
      dominator: seasonDominator(current.totals, current.teamTotals, row.pos),
      current: true,
    });
  }

  const threshold = config.breakout[row.pos];
  let breakout = null;
  if (threshold != null) {
    const idx = seasons.findIndex((s) => s.dominator != null && s.dominator >= threshold && (!s.current || s.games >= config.smallSampleGames));
    if (idx >= 0) {
      const s = seasons[idx];
      breakout = { year: s.year, seasonNumber: idx + 1, age: ageOn(row.dob, s.year), dominator: s.dominator };
    }
  }

  const lastFull = [...prior].reverse().find((s) => s.games >= 4) ?? prior.at(-1) ?? null;
  return {
    seasons,
    activeSeasons: seasons.length,
    breakout,
    priorPpg: lastFull ? round(fantasyPoints(lastFull.totals, scoring) / lastFull.games) : null,
    priorYear: lastFull?.year ?? null,
  };
}
