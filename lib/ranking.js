// Prospect Score: a 0–100 blend of opponent-adjusted production, efficiency and market
// share. Weights, benchmarks and opponent multipliers all live in data/ranking.json.
import { EMPTY_TOTALS, addTotals } from "./totals";
import { fantasyPoints } from "./scoring";

export const COMPONENTS = [
  { key: "production", label: "Production" },
  { key: "efficiency", label: "Efficiency" },
  { key: "marketShare", label: "Market share" },
];

// Opponent RPI rank -> multiplier (FCS and unranked opponents are 1x).
export function opponentTier(rank, config) {
  if (rank == null) return null;
  return config.opponentTiers.find((t) => rank <= t.upToRank) ?? null;
}

// Yards and touchdowns are scaled by the multiplier; receptions, INTs and fumbles aren't.
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

const share = (part, whole) => (whole > 0 ? Math.max(0, part) / whole : null);
const mean = (xs) => {
  const vals = xs.filter((x) => x != null);
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
};

// Market share of the team's offense ("dominator rating" in prospect-model terms).
// dominator: share of the team's yards and TDs in the player's role.
// opportunity: share of the team's touches in that role (targets aren't in ESPN's data,
// so receptions stand in for them).
export function usage(t, team, pos) {
  if (!team) return { dominator: null, opportunity: null, opportunityLabel: null };
  if (pos === "QB") {
    return {
      dominator: share(t.rushYds, team.rushYds),
      opportunity: share(t.rushAtt, team.rushAtt),
      opportunityLabel: "of team carries",
      dominatorLabel: "of team rush yds",
    };
  }
  if (pos === "RB") {
    return {
      dominator: mean([
        share(t.rushYds + t.recYds, team.rushYds + team.recYds),
        share(t.rushTD + t.recTD, team.rushTD + team.recTD),
      ]),
      opportunity: share(t.rushAtt + t.rec, team.rushAtt + team.rec),
      opportunityLabel: "of team touches",
      dominatorLabel: "dominator",
    };
  }
  return {
    dominator: mean([share(t.recYds, team.recYds), share(t.recTD, team.recTD)]),
    opportunity: share(t.rec, team.rec),
    opportunityLabel: "of team catches",
    dominatorLabel: "dominator",
  };
}

// One game: raw and RPI-adjusted points and totals, plus market share.
export function gamePerformance(w, config, scoring) {
  const tier = opponentTier(w.oppRank, config);
  const mult = tier?.multiplier ?? 1;
  const adjTotals = adjust(w.totals, mult);
  return {
    ...w,
    mult,
    tierLabel: tier?.label ?? null,
    raw: fantasyPoints(w.totals, scoring),
    adj: fantasyPoints(adjTotals, scoring),
    adjTotals,
    usage: usage(w.totals, w.teamTotals, w.pos),
  };
}

// Linear 0–100 between a floor and an elite value.
function scale(value, [floor, elite]) {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = (value - floor) / (elite - floor);
  return Math.round(Math.max(0, Math.min(1, pct)) * 100);
}

// Efficiency is shrunk toward the middle of the benchmark range until the player has a
// real sample, so one 75-yard catch doesn't read as elite.
function efficiency(t, team, bench) {
  const { stat, range, sample } = bench;
  let yards;
  let volume;
  if (stat === "ayPerAtt") {
    yards = t.passYds + 20 * t.passTD - 45 * t.int;
    volume = t.passAtt;
  } else if (stat === "ydsPerTouch") {
    yards = t.rushYds + t.recYds;
    volume = t.rushAtt + t.rec;
  } else {
    // Receiving yards per TEAM pass attempt: the most predictive single WR/TE stat.
    yards = t.recYds;
    volume = team.passAtt;
  }
  if (volume === 0) return { value: null, score: null };
  const prior = (range[0] + range[1]) / 2;
  const shrunk = (yards + prior * sample) / (volume + sample);
  return { value: Math.round((yards / volume) * 100) / 100, score: scale(shrunk, range) };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

export function scoreProspect(row, config, scoring) {
  const bench = config.benchmarks[row.pos];
  const weights = config.weights[row.pos];
  if (!bench || !weights) return null;

  const games = row.weeks.map((w) => gamePerformance({ ...w, pos: row.pos }, config, scoring));
  const gp = games.length;
  const adjTotal = games.reduce((s, g) => s + g.adj, 0);
  const rawTotal = games.reduce((s, g) => s + g.raw, 0);
  const adjPpg = gp ? adjTotal / gp : 0;

  // Season shares use only games where we have the team's totals.
  const withTeam = games.filter((g) => g.teamTotals);
  const playerSum = withTeam.reduce((s, g) => addTotals(s, g.totals), { ...EMPTY_TOTALS });
  const teamSum = withTeam.reduce((s, g) => addTotals(s, g.teamTotals), { ...EMPTY_TOTALS });
  const seasonUsage = withTeam.length ? usage(playerSum, teamSum, row.pos) : usage(playerSum, null, row.pos);

  const eff = efficiency(bench.efficiency.stat === "ydsPerTeamPassAtt" ? playerSum : row.totals, teamSum, bench.efficiency);

  const components = {
    production: gp ? scale(adjPpg, bench.ppg) : 0,
    efficiency: eff.score,
    marketShare: scale(seasonUsage.dominator, bench.marketShare),
  };

  // A component with no data yet drops out and the rest are re-weighted.
  let weightSum = 0;
  let weighted = 0;
  for (const { key } of COMPONENTS) {
    if (components[key] == null || !weights[key]) continue;
    weightSum += weights[key];
    weighted += weights[key] * components[key];
  }
  const score = weightSum ? round1(weighted / weightSum) : 0;
  const tier = config.tiers.find((t) => score >= t.min) ?? config.tiers[config.tiers.length - 1];

  // Production against the strongest tier of opponents.
  const topTier = config.opponentTiers[0];
  const vsTop = games.filter((g) => g.oppRank != null && g.oppRank <= topTier.upToRank);
  const vsTopPpg = vsTop.length ? vsTop.reduce((s, g) => s + g.adj, 0) / vsTop.length : null;

  // Markers: quick-read badges. "good" ones are strengths, "warn" ones are caveats.
  const high = config.markers.componentHigh;
  const markers = [];
  if (vsTopPpg != null && scale(vsTopPpg, bench.ppg) >= high - 20) {
    markers.push({ kind: "good", text: `Produces vs ${topTier.label}` });
  }
  if (components.production >= high) markers.push({ kind: "good", text: "Volume producer" });
  if (components.efficiency >= high) markers.push({ kind: "good", text: "Efficient" });
  if (components.marketShare >= high) {
    markers.push({ kind: "good", text: row.pos === "QB" ? "Dual threat" : "Alpha share" });
  }
  if (gp < config.markers.smallSampleGames) markers.push({ kind: "warn", text: "Small sample" });

  return {
    ...row,
    score,
    tier: tier.label,
    components,
    games,
    gp,
    adjTotal: round1(adjTotal),
    rawTotal: round1(rawTotal),
    adjPpg: round1(adjPpg),
    rawPpg: gp ? round1(rawTotal / gp) : 0,
    vsTop: { games: vsTop.length, ppg: vsTopPpg == null ? null : round1(vsTopPpg) },
    efficiencyValue: eff.value,
    efficiencyLabel: bench.efficiency.label,
    usage: seasonUsage,
    markers,
  };
}

// Score everyone, sort by Prospect Score, and add overall and positional ranks.
export function rankProspects(rows, config, scoring) {
  const scored = rows
    .map((row) => scoreProspect(row, config, scoring))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.adjPpg - a.adjPpg || a.name.localeCompare(b.name));
  const posCount = {};
  return scored.map((p, i) => {
    posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
    return { ...p, overallRank: i + 1, posRank: `${p.pos}${posCount[p.pos]}` };
  });
}
