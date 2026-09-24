// Pure parsing of ESPN game summaries (no fetching, no Next.js), so it can be unit tested
// against a saved fixture. lib/espn.js does the fetching and caching.
import { EMPTY_TOTALS } from "./totals";

export const CATEGORY_LABELS = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  fumbles: "Fumbles",
};

// "Trey'Dez Green Jr." -> "treydez green"
export function normalizeName(name = "") {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function teamBox(summary, teamName) {
  return (summary?.boxscore?.players ?? []).find((t) => t?.team?.displayName === teamName) ?? null;
}

// One player's stat lines from a game's box score. Matches on ESPN athlete id when the
// watchlist has one (survives name changes), otherwise on normalized name.
export function extractPlayerStats(summary, player) {
  const box = teamBox(summary, player.team);
  if (!box) return [];
  const target = normalizeName(player.name);

  const lines = [];
  for (const category of box.statistics ?? []) {
    if (!CATEGORY_LABELS[category.name]) continue;
    const athlete = (category.athletes ?? []).find((a) =>
      player.espnId
        ? String(a?.athlete?.id) === String(player.espnId)
        : normalizeName(a?.athlete?.displayName) === target
    );
    if (!athlete) continue;
    lines.push({
      name: category.name,
      keys: category.keys ?? [],
      labels: category.labels ?? [],
      values: athlete.stats ?? [],
    });
  }
  return lines;
}

// Box score lines -> the raw counting stats fantasy scoring and metrics need.
export function totalsFromLines(lines) {
  const t = { ...EMPTY_TOTALS };
  for (const line of lines ?? []) {
    const v = Object.fromEntries((line.keys ?? []).map((k, i) => [k, line.values?.[i]]));
    if (line.name === "passing") {
      const [cmp, att] = String(v["completions/passingAttempts"] ?? "0/0").split("/");
      t.passCmp += num(cmp);
      t.passAtt += num(att);
      t.passYds += num(v.passingYards);
      t.passTD += num(v.passingTouchdowns);
      t.int += num(v.interceptions);
    } else if (line.name === "rushing") {
      t.rushAtt += num(v.rushingAttempts);
      t.rushYds += num(v.rushingYards);
      t.rushTD += num(v.rushingTouchdowns);
    } else if (line.name === "receiving") {
      t.rec += num(v.receptions);
      t.recYds += num(v.receivingYards);
      t.recTD += num(v.receivingTouchdowns);
    } else if (line.name === "fumbles") {
      t.fumLost += num(v.fumblesLost);
    }
  }
  return t;
}

// The team's own totals for the game. ESPN's boxscore.teams has pass/rush attempts and
// yards but no receiving TDs, so we read each category's "totals" row instead (same keys
// as the player rows). Team plays = pass attempts + rush attempts (college counts sacks
// as rushes).
export function extractTeamTotals(summary, teamName) {
  const box = teamBox(summary, teamName);
  if (!box) return null;
  const lines = (box.statistics ?? [])
    .filter((c) => CATEGORY_LABELS[c.name])
    .map((c) => ({ name: c.name, keys: c.keys ?? [], values: c.totals ?? [] }));
  return totalsFromLines(lines);
}

// Opponent's conference id from the summary header (competitors[].team.groups.id).
export function opponentConferenceId(summary, teamName) {
  const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
  const opp = competitors.find((c) => c?.team?.displayName && c.team.displayName !== teamName);
  return opp?.team?.groups?.id ?? null;
}

// Season totals from ESPN's core API statistics payload (player or team):
// splits.categories[].stats[] = { name, value }. Missing categories count as zero.
export function totalsFromCoreStats(json) {
  const cats = Object.fromEntries(
    (json?.splits?.categories ?? []).map((c) => [
      c.name,
      Object.fromEntries((c.stats ?? []).map((s) => [s.name, num(s.value)])),
    ])
  );
  const p = cats.passing ?? {};
  const r = cats.rushing ?? {};
  const c = cats.receiving ?? {};
  const g = cats.general ?? {};
  return {
    games: g.gamesPlayed ?? 0,
    totals: {
      ...EMPTY_TOTALS,
      passCmp: p.completions ?? 0,
      passAtt: p.passingAttempts ?? 0,
      passYds: p.passingYards ?? 0,
      passTD: p.passingTouchdowns ?? 0,
      int: p.interceptions ?? 0,
      rushAtt: r.rushingAttempts ?? 0,
      rushYds: r.rushingYards ?? 0,
      rushTD: r.rushingTouchdowns ?? 0,
      rec: c.receptions ?? 0,
      recYds: c.receivingYards ?? 0,
      recTD: c.receivingTouchdowns ?? 0,
      fumLost: g.fumblesLost ?? 0,
    },
  };
}

// ".../seasons/2025/teams/142?lang=en" -> "142"
export function teamIdFromRef(ref) {
  return String(ref ?? "").match(/\/teams\/(\d+)/)?.[1] ?? null;
}
