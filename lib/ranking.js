// Prospect Score: a 0–100 blend of opponent-adjusted production, efficiency, size and
// speed. Weights, benchmarks and opponent multipliers all live in data/ranking.json.
import { fantasyPoints } from "./scoring";

export const COMPONENTS = [
  { key: "production", label: "Production" },
  { key: "efficiency", label: "Efficiency" },
  { key: "size", label: "Size" },
  { key: "speed", label: "Speed" },
];

// Opponent RPI rank -> multiplier (FCS and unranked opponents are 1x).
export function opponentTier(rank, config) {
  if (rank == null) return null;
  return config.opponentTiers.find((t) => rank <= t.upToRank) ?? null;
}

// Yards and touchdowns are scaled by the multiplier; receptions, INTs and fumbles aren't.
function adjust(t, m) {
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

// Linear 0–100 between a floor and an elite value. Works for "lower is better" too
// (e.g. 40 time [4.60, 4.30]) because the range is simply reversed.
function scale(value, [floor, elite]) {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = (value - floor) / (elite - floor);
  return Math.round(Math.max(0, Math.min(1, pct)) * 100);
}

// Efficiency is shrunk toward the middle of the benchmark range until the player has a
// real sample, so one 75-yard catch doesn't read as elite.
function efficiency(t, bench) {
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
    yards = t.recYds;
    volume = t.rec;
  }
  if (volume === 0) return { value: null, score: null };
  const prior = (range[0] + range[1]) / 2;
  const shrunk = (yards + prior * sample) / (volume + sample);
  return { value: Math.round((yards / volume) * 10) / 10, score: scale(shrunk, range) };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function feet(inches) {
  return inches ? `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"` : null;
}

export function scoreProspect(row, config, scoring) {
  const bench = config.benchmarks[row.pos];
  const weights = config.weights[row.pos];
  if (!bench || !weights) return null;

  // Per game: raw points, adjusted points, and the multiplier that was applied.
  const games = row.weeks.map((w) => {
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
    };
  });
  const gp = games.length;
  const adjTotal = games.reduce((s, g) => s + g.adj, 0);
  const rawTotal = games.reduce((s, g) => s + g.raw, 0);
  const adjPpg = gp ? adjTotal / gp : 0;

  const eff = efficiency(row.totals, bench.efficiency);
  const m = row.measurables ?? {};
  const heightScore = scale(m.height, bench.height);
  const weightScore = scale(m.weight, bench.weight);
  const sizeParts = [heightScore, weightScore].filter((x) => x != null);

  const components = {
    production: gp ? scale(adjPpg, bench.ppg) : 0,
    efficiency: eff.score,
    size: sizeParts.length ? Math.round(sizeParts.reduce((s, x) => s + x, 0) / sizeParts.length) : null,
    speed: scale(m.forty, bench.forty),
  };

  // Missing components (no 40 time yet, say) drop out and the rest are re-weighted.
  let weightSum = 0;
  let weighted = 0;
  for (const { key } of COMPONENTS) {
    if (components[key] == null) continue;
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
  if (components.speed >= high) markers.push({ kind: "good", text: "Speed" });
  if (components.size >= high) markers.push({ kind: "good", text: "Size" });
  if (gp < config.markers.smallSampleGames) markers.push({ kind: "warn", text: "Small sample" });
  if (m.forty == null) markers.push({ kind: "warn", text: "No 40 time" });
  if (m.height == null && m.weight == null) markers.push({ kind: "warn", text: "No size data" });

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
    heightText: feet(m.height),
    weightText: m.weight ? `${m.weight} lbs` : null,
    fortyText: m.forty ? `${m.forty.toFixed(2)} 40` : null,
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
