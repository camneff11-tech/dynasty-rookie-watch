import { unstable_cache } from "next/cache";

// ESPN's public (unofficial, undocumented) college football endpoints. No API key needed.
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

export const REGULAR_SEASON_WEEKS = 15;

const CATEGORY_LABELS = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  fumbles: "Fumbles",
};

// Raw ESPN responses are 0.5–1.5 MB, so we don't cache them; we cache the small
// processed week instead (see getWeekData below).
async function getJson(url, init = { cache: "no-store" }) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`);
  return res.json();
}

// "Trey'Dez Green Jr." -> "treydez green"
function normalizeName(name = "") {
  return name
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

// Pull one player's stat lines out of a game's box score. Matches on ESPN athlete id
// when the watchlist has one (survives name changes), otherwise on normalized name.
function extractPlayerStats(summary, player) {
  const target = normalizeName(player.name);
  const teamBox = (summary?.boxscore?.players ?? []).find(
    (t) => t?.team?.displayName === player.team
  );
  if (!teamBox) return [];

  const lines = [];
  for (const category of teamBox.statistics ?? []) {
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

// Box score lines -> the raw counting stats fantasy scoring needs.
export const EMPTY_TOTALS = {
  passCmp: 0, passAtt: 0, passYds: 0, passTD: 0, int: 0,
  rushAtt: 0, rushYds: 0, rushTD: 0,
  rec: 0, recYds: 0, recTD: 0,
  fumLost: 0,
};

function totalsFromLines(lines) {
  const t = { ...EMPTY_TOTALS };
  for (const line of lines) {
    const v = Object.fromEntries(line.keys.map((k, i) => [k, line.values[i]]));
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

export function addTotals(a, b) {
  const out = { ...a };
  for (const k of Object.keys(EMPTY_TOTALS)) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
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
  const results = await Promise.allSettled(
    events
      .filter((e) => e.competitions[0].status?.type?.state !== "pre")
      .map(async (e) => [e.id, await getGameSummary(e.id)])
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
    const opponent = competition.competitors.find(
      (c) => c.team?.displayName !== player.team
    )?.team?.displayName;
    const game = describeGame(competition);
    const lines = summaries.has(event.id)
      ? extractPlayerStats(summaries.get(event.id), player)
      : [];

    let status = "played";
    if (game.state === "pre") status = "upcoming";
    else if (game.state === "in") status = "live";
    else if (lines.length === 0) status = "no stats";

    const filmQuery = `${player.name} ${player.team} vs ${opponent} Week ${week} ${season} highlights`;

    return {
      ...base,
      status,
      totals: totalsFromLines(lines),
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

// Finished weeks rarely change, so they're cached for 6 hours. The current week refreshes
// every 10 minutes so game-day stats show up quickly. The watchlist is part of the cache
// key (unstable_cache keys on the arguments), so editing players.json busts the cache.
const cachedPastWeek = unstable_cache(fetchWeekStrict, ["week-v2"], { revalidate: 60 * 60 * 6 });
const cachedLiveWeek = unstable_cache(fetchWeekStrict, ["week-v2-live"], { revalidate: 60 * 10 });

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
const cachedPastResults = unstable_cache(fetchWeekResults, ["results-v1"], { revalidate: 60 * 60 * 6 });
const cachedLiveResults = unstable_cache(fetchWeekResults, ["results-v1-live"], { revalidate: 60 * 10 });

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
// Measurables: height (inches) and weight (lbs) from ESPN's athlete profile.
// 40 times aren't published for college players; add "forty" in players.json.

async function fetchAthlete(id) {
  const a = await getJson(
    `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/${id}`
  );
  return { height: a.height ?? null, weight: a.weight ?? null, experience: a.experience?.abbreviation ?? null };
}
const cachedAthlete = unstable_cache(fetchAthlete, ["athlete-v1"], { revalidate: 60 * 60 * 24 });

// "6-2", "6'2\"" or 74 -> 74
function parseHeight(value) {
  if (typeof value === "number") return value;
  const m = String(value ?? "").match(/(\d+)\D+(\d+)/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

export async function getMeasurables(players) {
  const espn = await Promise.all(
    players.map((p) => (p.espnId ? cachedAthlete(String(p.espnId)).catch(() => null) : null))
  );
  // Values in players.json win over ESPN's.
  return players.map((p, i) => ({
    height: parseHeight(p.height) ?? espn[i]?.height ?? null,
    weight: p.weight ?? espn[i]?.weight ?? null,
    forty: p.forty ?? null,
    experience: espn[i]?.experience ?? null,
  }));
}

// Everything the rankings page needs: season games, opponent RPI ranks, measurables.
export async function buildRankingInputs({ season, throughWeek, players, currentWeek }) {
  const [seasonData, rpi, measurables] = await Promise.all([
    buildSeason({ season, throughWeek, players, currentWeek }),
    getRpi({ season, throughWeek, currentWeek }).catch(() => null),
    getMeasurables(players),
  ]);

  const rows = seasonData.rows.map((row, i) => ({
    ...row,
    measurables: measurables[i],
    weeks: row.weeks.map((w) => ({ ...w, oppRank: rpi?.[w.opponent]?.rank ?? null })),
  }));

  return {
    rows,
    rpi,
    errors: [...seasonData.errors, ...(rpi ? [] : ["RPI could not be computed"])],
    updatedAt: seasonData.updatedAt,
  };
}
