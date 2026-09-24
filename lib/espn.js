import { unstable_cache } from "next/cache";
import { EMPTY_TOTALS, addTotals } from "./totals";
import {
  CATEGORY_LABELS,
  extractPlayerStats,
  extractTeamTotals,
  opponentConferenceId,
  teamIdFromRef,
  totalsFromCoreStats,
  totalsFromLines,
} from "./boxscore";

export { EMPTY_TOTALS, addTotals };

// ESPN's public (unofficial, undocumented) college football endpoints. No API key needed.
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

export const REGULAR_SEASON_WEEKS = 15;

// Raw ESPN responses are 0.5–1.5 MB, so we don't cache them; we cache the small
// processed week instead (see getWeekData below).
async function getJson(url, init = { cache: "no-store" }) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`);
  return res.json();
}

// ESPN's default scoreboard tells us the current season and week.
export async function getCurrentWeek() {
  const fallback = { season: new Date().getFullYear(), week: 1 };
  try {
    const data = await getJson(`${BASE}/scoreboard`, { next: { revalidate: 600 } });
    const season = data?.season?.year ?? fallback.season;
    const type = data?.season?.type; // 1 preseason, 2 regular season, 3+ postseason
    if (type === 1) return { season, week: 1 };
    if (type !== 2) return { season, week: REGULAR_SEASON_WEEKS };
    return { season, week: Math.min(data?.week?.number ?? 1, REGULAR_SEASON_WEEKS) };
  } catch {
    return fallback;
  }
}

function getScoreboard({ season, week }) {
  // groups=80 = all FBS games. limit is high so nothing gets paged off.
  const params = new URLSearchParams({
    groups: "80",
    limit: "400",
    seasontype: "2",
    dates: String(season),
    week: String(week),
  });
  return getJson(`${BASE}/scoreboard?${params}`);
}

function getGameSummary(eventId) {
  return getJson(`${BASE}/summary?event=${eventId}`);
}

// Run async jobs with at most `limit` in flight (the watchlist spans ~60 teams, so a week
// can mean 50+ box scores; this keeps us polite to ESPN). Returns allSettled-style results.
async function settledPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function describeGame(competition) {
  const competitors = competition.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  const state = competition.status?.type?.state; // "pre" | "in" | "post"
  const score =
    state === "pre"
      ? `${away.team.displayName} at ${home.team.displayName}`
      : `${away.team.displayName} ${away.score}, ${home.team.displayName} ${home.score}`;
  return { state, score, statusText: competition.status?.type?.shortDetail ?? "" };
}

async function fetchWeek({ season, week, players }) {
  const errors = [];
  const watchedTeams = new Set(players.map((p) => p.team));

  // 1. Every FBS game this week, filtered to games involving a watched team.
  let events = [];
  try {
    const board = await getScoreboard({ season, week });
    events = (board.events ?? []).filter((e) =>
      e.competitions?.[0]?.competitors?.some((c) => watchedTeams.has(c.team?.displayName))
    );
  } catch (err) {
    errors.push(err.message);
  }

  // 2. Box scores for those games (only ones that have kicked off).
  const summaries = new Map();
  const results = await settledPool(
    events.filter((e) => e.competitions[0].status?.type?.state !== "pre"),
    8,
    async (e) => [e.id, await getGameSummary(e.id)]
  );
  for (const r of results) {
    if (r.status === "fulfilled") summaries.set(r.value[0], r.value[1]);
    else errors.push(r.reason?.message ?? "A box score request failed");
  }

  // 3. One row per watched player.
  const rows = players.map((player) => {
    const base = { ...player, week, season, totals: { ...EMPTY_TOTALS }, stats: [] };
    const event = events.find((e) =>
      e.competitions[0].competitors.some((c) => c.team?.displayName === player.team)
    );
    if (!event) return { ...base, status: "no game" };

    const competition = event.competitions[0];
    const oppCompetitor = competition.competitors.find((c) => c.team?.displayName !== player.team);
    const opponent = oppCompetitor?.team?.displayName;
    const game = describeGame(competition);
    const summary = summaries.get(event.id);
    const lines = summary ? extractPlayerStats(summary, player) : [];
    const confId =
      oppCompetitor?.team?.conferenceId ?? (summary ? opponentConferenceId(summary, player.team) : null);

    let status = "played";
    if (game.state === "pre") status = "upcoming";
    else if (game.state === "in") status = "live";
    else if (lines.length === 0) status = "no stats";

    const filmQuery = `${player.name} ${player.team} vs ${opponent} Week ${week} ${season} highlights`;

    return {
      ...base,
      status,
      totals: totalsFromLines(lines),
      teamTotals: summary ? extractTeamTotals(summary, player.team) : null,
      opponentConferenceId: confId != null ? String(confId) : null,
      stats: lines.map((line) => ({
        category: CATEGORY_LABELS[line.name],
        stats: line.labels.map((label, i) => ({ label, value: line.values[i] ?? "-" })),
      })),
      eventId: event.id,
      date: event.date,
      opponent,
      score: game.score,
      statusText: game.statusText,
      boxScoreUrl: `https://www.espn.com/college-football/game/_/gameId/${event.id}`,
      filmUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(filmQuery)}`,
    };
  });

  return { rows, errors, updatedAt: new Date().toISOString() };
}

// Throwing inside the cached function keeps a partial (failed) result out of the cache.
async function fetchWeekStrict(args) {
  const data = await fetchWeek(args);
  if (data.errors.length > 0) throw new Error(data.errors.join("; "));
  return data;
}

// Finished weeks rarely change, so they're cached for 7 days. The current week refreshes
// every 30 minutes. The watchlist is part of the cache
// key (unstable_cache keys on the arguments), so editing players.json busts the cache.
const cachedPastWeek = unstable_cache(fetchWeekStrict, ["week-v4"], { revalidate: 60 * 60 * 24 * 7 });
const cachedLiveWeek = unstable_cache(fetchWeekStrict, ["week-v4-live"], { revalidate: 60 * 30 });

export async function buildWeek({ season, week, players, currentWeek }) {
  const cached = currentWeek && week < currentWeek ? cachedPastWeek : cachedLiveWeek;
  try {
    return await cached({ season, week, players });
  } catch {
    // Something failed at ESPN; show whatever we can get right now, uncached.
    return fetchWeek({ season, week, players });
  }
}

// Season-to-date totals: every week from 1 through the current week, summed per player.
export async function buildSeason({ season, throughWeek, players, currentWeek }) {
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  const weekData = await Promise.all(
    weeks.map((week) => buildWeek({ season, week, players, currentWeek }))
  );

  const rows = players.map((player, i) => {
    const games = weekData
      .map((w) => w.rows[i])
      .filter((r) => r.status === "played" || r.status === "live");
    return {
      ...player,
      season,
      gamesPlayed: games.length,
      totals: games.reduce((acc, g) => addTotals(acc, g.totals), { ...EMPTY_TOTALS }),
      weeks: games.map((g) => ({
        week: g.week,
        opponent: g.opponent,
        live: g.status === "live",
        totals: g.totals,
        teamTotals: g.teamTotals,
        opponentConferenceId: g.opponentConferenceId,
      })),
    };
  });

  return {
    rows,
    errors: weekData.flatMap((w) => w.errors),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Opponent strength: RPI computed from every FBS game result so far.
// RPI = 25% win pct + 50% opponents' win pct + 25% opponents' opponents' win pct.

async function fetchFbsTeams(season) {
  const data = await getJson(
    `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80&season=${season}`
  );
  const names = [];
  const walk = (node) => {
    for (const e of node?.standings?.entries ?? []) names.push(e.team.displayName);
    for (const child of node?.children ?? []) walk(child);
  };
  walk(data);
  if (names.length === 0) throw new Error("ESPN returned no FBS teams");
  return names;
}
const getFbsTeams = unstable_cache(fetchFbsTeams, ["fbs-teams-v1"], { revalidate: 60 * 60 * 24 });

// Compact final scores for one week: [{ a, b, winner }] with team display names.
async function fetchWeekResults(season, week) {
  const board = await getScoreboard({ season, week });
  const games = [];
  for (const e of board.events ?? []) {
    const c = e.competitions?.[0];
    if (c?.status?.type?.state !== "post") continue;
    const [x, y] = c.competitors ?? [];
    if (!x || !y) continue;
    games.push({
      a: x.team.displayName,
      b: y.team.displayName,
      winner: x.winner ? x.team.displayName : y.winner ? y.team.displayName : null,
    });
  }
  return games;
}
const cachedPastResults = unstable_cache(fetchWeekResults, ["results-v1"], { revalidate: 60 * 60 * 24 * 7 });
const cachedLiveResults = unstable_cache(fetchWeekResults, ["results-v1-live"], { revalidate: 60 * 30 });

export function computeRpi(games, fbsTeams) {
  const played = new Map(); // team -> [{ opp, won }]
  for (const g of games) {
    for (const [team, opp] of [[g.a, g.b], [g.b, g.a]]) {
      if (!played.has(team)) played.set(team, []);
      played.get(team).push({ opp, won: g.winner === team });
    }
  }

  // Win pct, optionally ignoring games against one team (standard RPI practice).
  const winPct = (team, excluding) => {
    const list = (played.get(team) ?? []).filter((g) => g.opp !== excluding);
    return list.length ? list.filter((g) => g.won).length / list.length : 0;
  };
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const owp = (team) => avg((played.get(team) ?? []).map((g) => winPct(g.opp, team)));
  const oowp = (team) => avg((played.get(team) ?? []).map((g) => owp(g.opp)));

  const table = fbsTeams
    .filter((t) => played.has(t))
    .map((team) => {
      const list = played.get(team);
      const wins = list.filter((g) => g.won).length;
      return {
        team,
        record: `${wins}-${list.length - wins}`,
        rpi: 0.25 * winPct(team) + 0.5 * owp(team) + 0.25 * oowp(team),
      };
    })
    .sort((x, y) => y.rpi - x.rpi);

  return Object.fromEntries(
    table.map((row, i) => [row.team, { rank: i + 1, rpi: Math.round(row.rpi * 10000) / 10000, record: row.record }])
  );
}

// { "Ohio State Buckeyes": { rank, rpi, record }, ... } for FBS teams. FCS teams are absent.
export async function getRpi({ season, throughWeek, currentWeek }) {
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  const [fbsTeams, ...results] = await Promise.all([
    getFbsTeams(season),
    ...weeks.map((w) => (w < currentWeek ? cachedPastResults : cachedLiveResults)(season, w)),
  ]);
  return computeRpi(results.flat(), fbsTeams);
}

// ---------------------------------------------------------------------------
// Career: prior-season totals per player (and the team's totals that season, for market
// share), from ESPN's core API. Past seasons don't change, so each piece is cached for 30
// days and the assembled career table for 7.

const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
const MONTH = 60 * 60 * 24 * 30;

// 404 means "no such season for this player" (e.g. still in high school): return null.
async function getCoreJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`);
  return res.json();
}

const cachedAthleteSeason = unstable_cache(
  async (athleteId, year) => {
    const [stats, record] = await Promise.all([
      getCoreJson(`${CORE}/seasons/${year}/types/2/athletes/${athleteId}/statistics`),
      getCoreJson(`${CORE}/seasons/${year}/athletes/${athleteId}`),
    ]);
    if (!stats) return null;
    const { games, totals } = totalsFromCoreStats(stats);
    return { year, teamId: teamIdFromRef(record?.team?.$ref), games, totals };
  },
  ["athlete-season-v1"],
  { revalidate: MONTH }
);

const cachedTeamSeason = unstable_cache(
  async (teamId, year) => {
    const [stats, team] = await Promise.all([
      getCoreJson(`${CORE}/seasons/${year}/types/2/teams/${teamId}/statistics`),
      getCoreJson(`${CORE}/seasons/${year}/teams/${teamId}`),
    ]);
    if (!stats) return null;
    return { team: team?.displayName ?? null, totals: totalsFromCoreStats(stats).totals };
  },
  ["team-season-v1"],
  { revalidate: MONTH }
);

// Prior seasons to look at: three for older classes, fewer for the youngest.
function priorYears(player, season) {
  const count = Math.max(1, Math.min(3, 3 - (player.nflYear - (season + 1))));
  return Array.from({ length: count }, (_, i) => season - 1 - i);
}

async function fetchCareers(season, players) {
  const errors = [];
  const jobs = players.flatMap((p) =>
    p.espnId ? priorYears(p, season).map((year) => ({ id: String(p.espnId), year })) : []
  );
  const seasons = await settledPool(jobs, 8, (j) => cachedAthleteSeason(j.id, j.year));

  const teamKeys = [
    ...new Set(
      seasons
        .filter((r) => r.status === "fulfilled" && r.value?.teamId)
        .map((r) => `${r.value.teamId}:${r.value.year}`)
    ),
  ];
  const teamResults = await settledPool(teamKeys, 8, (k) => {
    const [teamId, year] = k.split(":");
    return cachedTeamSeason(teamId, Number(year));
  });
  const teams = new Map(teamKeys.map((k, i) => [k, teamResults[i].status === "fulfilled" ? teamResults[i].value : null]));

  const careers = {};
  seasons.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      errors.push(`Career stats failed for athlete ${jobs[i].id} (${jobs[i].year})`);
      return;
    }
    if (!r.value || r.value.games === 0) return;
    const team = teams.get(`${r.value.teamId}:${r.value.year}`);
    (careers[jobs[i].id] ??= []).push({
      year: r.value.year,
      team: team?.team ?? null,
      games: r.value.games,
      totals: r.value.totals,
      teamTotals: team?.totals ?? null,
    });
  });
  for (const list of Object.values(careers)) list.sort((a, b) => a.year - b.year);
  if (errors.length) throw Object.assign(new Error("career fetch incomplete"), { partial: { careers, errors } });
  return { careers, errors };
}

const cachedCareers = unstable_cache(fetchCareers, ["careers-v1"], { revalidate: 60 * 60 * 24 * 7 });

export async function getCareers(season, players) {
  const key = players.map((p) => ({ espnId: p.espnId ?? null, nflYear: p.nflYear }));
  try {
    return await cachedCareers(season, key);
  } catch (err) {
    // Some requests failed: use what we got (uncached) rather than nothing.
    return err.partial ?? { careers: {}, errors: ["Prior-season stats unavailable"] };
  }
}

// Everything the rankings page needs: season games, opponent RPI ranks, prior seasons.
export async function buildRankingInputs({ season, throughWeek, players, currentWeek }) {
  const [seasonData, rpi, career] = await Promise.all([
    buildSeason({ season, throughWeek, players, currentWeek }),
    getRpi({ season, throughWeek, currentWeek }).catch(() => null),
    getCareers(season, players),
  ]);

  const rows = seasonData.rows.map((row) => ({
    ...row,
    career: row.espnId ? career.careers[String(row.espnId)] ?? [] : [],
    weeks: row.weeks.map((w) => ({ ...w, oppRank: rpi?.[w.opponent]?.rank ?? null })),
  }));

  return {
    rows,
    rpi,
    errors: [
      ...seasonData.errors,
      ...(rpi ? [] : ["RPI could not be computed"]),
      ...(career.errors.length ? [`${career.errors.length} prior-season lookups failed`] : []),
    ],
    updatedAt: seasonData.updatedAt,
  };
}
