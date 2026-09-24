// The watchlist, with optional extra stat columns merged in by player name.
//
// data/players.json: one entry per prospect. Required: name, pos, team, nflYear.
// Optional: espnId (preferred match key), dob ("YYYY-MM-DD"), bigBoardRank (projected
// draft slot, 1 = best), rookieRank (consensus fantasy rookie rank), earlyDeclareEligible
// (true/false). bigBoardRank and rookieRank were seeded from NFL Mock Draft Database's
// fantasy rookie rankings (2027 top 100, 2028 full list) in Sept 2026.
//
// data/extras.json: rows of stats ESPN doesn't have, e.g. from a CSV export:
//   [{ "name": "Jeremiah Smith", "yprr": 3.1, "pffGrade": 91.2, "ras": 9.4 }]
// Each row lands on the matching player as `extras` (matched by normalized name, so
// "Jr." and accents don't matter). Unmatched rows are ignored.
import basePlayers from "../data/players.json";
import extraRows from "../data/extras.json";
import { normalizeName } from "./boxscore";

export function mergeExtras(list, rows) {
  const byName = new Map();
  for (const row of rows ?? []) {
    if (!row?.name) continue;
    const { name, ...cols } = row;
    byName.set(normalizeName(name), { ...(byName.get(normalizeName(name)) ?? {}), ...cols });
  }
  return list.map((p) => {
    const extras = byName.get(normalizeName(p.name));
    return extras ? { ...p, extras: { ...(p.extras ?? {}), ...extras } } : p;
  });
}

export const players = mergeExtras(basePlayers, extraRows);
