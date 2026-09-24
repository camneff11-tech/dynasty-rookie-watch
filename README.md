# League of Guisto Dynasty Rookie Review

Colors follow the Saint Mary's (SMC) logo: navy `#06315b`, red `#db0024`, silver `#d3d3d3`.

Dynasty prospect rankings and weekly production for the 2027 and 2028 NFL draft classes,
pulled live from ESPN's public college football API (no key, no paid data).

## Pages (tabs)
- **Rankings** `/`: Prospect Score by position (All / QB / RB / WR / TE tabs), sortable table,
  flags (breakout, QB archetype, small sample) and the Certified Stud sticker.
- **Player** `/player/<slug>`: season totals, Power 4 splits, career by season, the score
  breakdown with each component's watchlist percentile, a weekly chart, and the game log.
- **Top performances** `/performances?week=3`: games ranked by points or usage (dominator),
  RPI-weighted or raw. `?week=all` shows the season's best single games.
- **Studs & Duds** `/studs?week=3`: the week's 10 best games, and the 10 biggest drops below a
  player's own average.
- **Box scores** `/week?week=3`: full stat lines with highlight and ESPN links.
- **Season** `/season`: season-to-date totals (raw, not RPI-adjusted).

JSON (for Power BI / Sheets):
- `/api/prospects?pos=WR&class=2027&scoring=ppr`: one flat row per prospect with every metric,
  component score and percentile
- `/api/rankings`: full ranked objects plus the RPI table
- `/api/stats?week=3`, `/api/season`

## Watchlist: `data/players.json`
Top 100 of the 2027 class and the full 2028 list from NFL Mock Draft Database's fantasy rookie
rankings (Sept 2026), plus a few earlier picks. Each entry:

    { "name": "Jeremiah Smith", "pos": "WR", "team": "Ohio State Buckeyes", "nflYear": 2027,
      "espnId": "5079720", "bigBoardRank": 2, "rookieRank": 1 }

- `team` must match ESPN's full team name. `espnId` (from the player's ESPN URL) is the match
  key; without it the player is matched by name.
- Optional: `dob` ("YYYY-MM-DD", enables the Age component), `bigBoardRank` (projected draft
  slot, drives Draft capital), `earlyDeclareEligible` (true/false).
- Extra stats ESPN doesn't have (YPRR, YAC, missed tackles forced, PFF grades, RAS) go in
  `data/extras.json` as `[{ "name": "...", "yprr": 3.1 }]`, merged by player name
  (`lib/players.js`). They show on player pages and in `/api/prospects`, ready to be wired into
  the model.

## The model
Settings: `lib/model-config.js`. Metrics: `lib/metrics.js` (a comment block explains each one
and why analysts use it). Scoring: `lib/ranking.js`.

Each component is scored 0–100 against a fixed benchmark for the position, then weighted.
Components with no data are dropped and the rest re-weighted, never counted as zero.

| Component | What it measures |
|---|---|
| Draft capital | `bigBoardRank` |
| Team-normalized | QB adj. yds/att, RB scrimmage yds/team play, WR/TE rec yds/team pass att |
| Production | fantasy PPG, yards and TDs weighted by opponent RPI |
| Market share | WR/TE 0.8 × rec yds share + 0.2 × rec TD share; RB rush/rec share; QB rushing share of points |
| Age | age on Sept 1 (needs `dob`) |
| Power 4 production | PPG vs ACC, Big 12, Big Ten, SEC and Notre Dame |
| Prior-season production | PPG in the last full prior season (ESPN season stats) |
| Early breakout | first season at 20% (WR) or 15% (RB/TE) market share; 1st season = 100, 2nd = 70, 3rd = 40 |

**RPI weighting.** RPI is computed from every FBS result this season (25% win pct, 50%
opponents' win pct, 25% opponents' opponents'). Yards and TDs count ×1.25 vs RPI 1–25, ×1.15 vs
26–50, ×1.1 vs 51–75, ×1.05 vs 76–100, ×1 otherwise (including FCS). Early in the season RPI is
noisy.

**Certified Stud** sticker: every Tier 1 prospect (score 80+) and any game over 30 raw fantasy
points. **Tiers:** 80+ Elite, 65+ Starter, 50+ Upside, below that Watch.

Scores are benchmark-based rather than watchlist percentiles (small position groups make
percentiles jumpy); percentiles are shown alongside on player pages.

## Caching
Processed weeks are cached (finished weeks 7 days, the current week 30 minutes). Prior-season
stats are cached for 30 days per player-season and 7 days as a whole. Editing `players.json`
changes the cache key. If ESPN fails, pages show partial data and a note.

## Run and test locally
    npm install
    npm run dev      # http://localhost:3000
    npm test         # vitest, against saved ESPN responses in fixtures/

## Deploy
Pushes to `main` on GitHub deploy to Vercel automatically. Optional `SEASON` env var pins a season.

ESPN's API is unofficial and undocumented: no key, but it can change without notice.
