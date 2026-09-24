// Composite Prospect Score, watchlist percentiles, and Studs & Duds. Settings live in
// lib/model-config.js; the metrics themselves in lib/metrics.js.
import { careerMetrics, gamePerformance, seasonMetrics } from "./metrics";

export { gamePerformance };

export const COMPONENTS = [
  { key: "draftCapital", label: "Draft capital" },
  { key: "teamNormalized", label: "Team-normalized" },
  { key: "production", label: "Production (RPI adj.)" },
  { key: "share", label: "Market share" },
  { key: "age", label: "Age" },
  { key: "power4", label: "Power 4 production" },
  { key: "priorProduction", label: "Prior-season production" },
  { key: "breakout", label: "Early breakout" },
];

// Linear 0–100 between floor and elite (a reversed range means lower is better).
export function scale(value, [floor, elite]) {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = (value - floor) / (elite - floor);
  return Math.round(Math.max(0, Math.min(1, pct)) * 100);
}

// Pull a small-sample ratio toward the middle of its benchmark range.
function shrink(value, volume, bench) {
  if (value == null || !bench.sample) return value;
  const prior = (bench.range[0] + bench.range[1]) / 2;
  return (value * volume + prior * bench.sample) / (volume + bench.sample);
}

// The raw value behind each component, before scaling.
function componentValues(row, m, config) {
  const bench = config.benchmarks[row.pos];
  const tn = bench.teamNormalized;
  return {
    draftCapital: Number.isFinite(row.bigBoardRank) ? row.bigBoardRank : null,
    teamNormalized: m[tn.metric] ?? null,
    production: m.games ? m.adjPpg : null,
    share: m[bench.share.metric] ?? null,
    age: m.age,
    power4: m.splits.power4.games ? m.splits.power4.ppg : null,
    priorProduction: m.career.priorPpg,
    breakout: m.career.breakout?.seasonNumber ?? null,
  };
}

function breakoutScore(career, config) {
  if (career.breakout) return config.breakoutScore[career.breakout.seasonNumber] ?? config.breakoutScore[4];
  return career.activeSeasons >= 2 ? 0 : null;
}

function componentScores(row, m, values, config) {
  const bench = config.benchmarks[row.pos];
  const tn = bench.teamNormalized;
  return {
    draftCapital: scale(values.draftCapital, config.draftCapital),
    teamNormalized: scale(shrink(values.teamNormalized, m.volume[tn.metric] ?? 0, tn), tn.range),
    production: scale(values.production, bench.production),
    share: scale(values.share, bench.share.range),
    age: scale(values.age, config.age),
    power4: scale(values.power4, bench.power4),
    priorProduction: scale(values.priorProduction, bench.production),
    breakout: config.breakout[row.pos] == null ? null : breakoutScore(m.career, config),
  };
}

export function scoreProspect(row, config, scoring = "ppr") {
  const weights = config.weights[row.pos];
  if (!weights || !config.benchmarks[row.pos]) return null;

  const metrics = seasonMetrics(row, config, scoring);
  metrics.career = careerMetrics(row, metrics, config, scoring);
  const values = componentValues(row, metrics, config);
  const components = componentScores(row, metrics, values, config);

  // Weighted average of the components that have data; missing ones are re-weighted.
  let weightSum = 0;
  let weighted = 0;
  for (const { key } of COMPONENTS) {
    if (components[key] == null || !weights[key]) continue;
    weightSum += weights[key];
    weighted += weights[key] * components[key];
  }
  const score = weightSum ? Math.round((weighted / weightSum) * 10) / 10 : 0;
  const tier = config.tiers.find((t) => score >= t.min) ?? config.tiers.at(-1);

  const flags = [];
  const bo = metrics.career.breakout;
  if (bo) {
    const when = bo.age ? `at ${bo.age}` : `season ${bo.seasonNumber} (${bo.year})`;
    flags.push({ kind: "good", text: `Breakout ${when}` });
  }
  if (metrics.games === 0 && metrics.career.priorPpg != null) {
    flags.push({ kind: "warn", text: `No ${row.season} games yet` });
  }
  if (row.pos === "QB" && metrics.archetype) flags.push({ kind: "info", text: metrics.archetype });
  if (row.earlyDeclareEligible) flags.push({ kind: "info", text: "Early-declare eligible" });
  if (metrics.games < config.smallSampleGames) flags.push({ kind: "warn", text: "Small sample" });

  const bigGames = metrics.gamesDetail.filter((g) => g.raw > config.certifiedStud.gamePoints);
  const certified = score >= config.certifiedStud.minScore || bigGames.length > 0;

  return {
    ...row,
    slug: slugify(row.name),
    certified,
    bigGames: bigGames.map((g) => g.week),
    score,
    tier: tier.label,
    metrics,
    values,
    components,
    coverage: weightSum, // total weight that had data
    flags,
  };
}

export function slugify(name = "") {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Percentile of `value` among `others` (0–100; ties count half).
export function percentile(value, others) {
  const vals = others.filter((v) => v != null && Number.isFinite(v));
  if (value == null || vals.length < 2) return null;
  const below = vals.filter((v) => v < value).length;
  const equal = vals.filter((v) => v === value).length;
  return Math.round(((below + 0.5 * (equal - 1)) / (vals.length - 1)) * 100);
}

// Lower-is-better components flip before taking percentiles.
const LOWER_IS_BETTER = { draftCapital: true, age: true, breakout: true };

// Score everyone, add overall and positional ranks, and within-position percentiles.
export function rankProspects(rows, config, scoring = "ppr") {
  const scored = rows
    .map((row) => scoreProspect(row, config, scoring))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.metrics.adjPpg ?? 0) - (a.metrics.adjPpg ?? 0) || a.name.localeCompare(b.name));

  const byPos = {};
  for (const p of scored) (byPos[p.pos] ??= []).push(p);

  const posCount = {};
  return scored.map((p, i) => {
    posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
    const peers = byPos[p.pos];
    const percentiles = {};
    for (const { key } of COMPONENTS) {
      const sign = LOWER_IS_BETTER[key] ? -1 : 1;
      const v = p.values[key];
      percentiles[key] = percentile(v == null ? null : sign * v, peers.map((q) => (q.values[key] == null ? null : sign * q.values[key])));
    }
    return { ...p, overallRank: i + 1, posRank: `${p.pos}${posCount[p.pos]}`, percentiles };
  });
}

// ---------------------------------------------------------------------------
// Studs & Duds

// Studs: the week's top games by RPI-adjusted points.
// Duds: the biggest drops below the player's own average in his other games, among
// players who normally matter (baseline of at least `minBaseline` points).
export function studsAndDuds(rows, week, config, scoring = "ppr") {
  const { count, minBaseline } = config.studsDuds;
  const games = [];
  for (const row of rows) {
    const all = (row.weeks ?? []).map((w) => gamePerformance({ ...w, pos: row.pos }, config, scoring));
    const game = all.find((g) => g.week === week);
    if (!game) continue;
    const others = all.filter((g) => g.week !== week);
    const baseline = others.length ? others.reduce((s, g) => s + g.adj, 0) / others.length : null;
    games.push({
      ...row,
      ...game,
      certified: game.raw > config.certifiedStud.gamePoints,
      slug: slugify(row.name),
      baseline: baseline == null ? null : Math.round(baseline * 10) / 10,
      delta: baseline == null ? null : Math.round((game.adj - baseline) * 10) / 10,
    });
  }

  const studs = [...games].sort((a, b) => b.adj - a.adj).slice(0, count);
  const duds = games
    .filter((g) => g.baseline != null && g.baseline >= minBaseline && g.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, count)
    .map((g) => ({ ...g, certifiedDud: true }));
  return { studs, duds, played: games.length };
}

export const gameKey = (g) => `${g.espnId ?? g.name}:${g.week}`;

// "Certified Dud" games: each week's top-10 duds within the player's own draft class
// (all positions), so the sticker means the same thing on every tab.
export function certifiedDudKeys(rows, config, scoring = "ppr") {
  const keys = new Set();
  const byClass = {};
  for (const r of rows) (byClass[r.nflYear] ??= []).push(r);
  for (const classRows of Object.values(byClass)) {
    const weeks = new Set(classRows.flatMap((r) => (r.weeks ?? []).map((w) => w.week)));
    for (const week of weeks) {
      for (const g of studsAndDuds(classRows, week, config, scoring).duds) keys.add(gameKey(g));
    }
  }
  return keys;
}
