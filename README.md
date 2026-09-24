# League of Guisto Dynasty Rookie Review

Colors follow the Saint Mary's (SMC) logo: navy `#06315b`, red `#db0024`, silver `#d3d3d3`.

Weekly and season-to-date fantasy production for 2027 NFL draft prospects (plus a few 2028
devy names), pulled live from ESPN's public college football API.

## Pages (tabs)
- **Rankings** `/`: Prospect Score rankings (see "Ranking system" below).
- **Top performances** `/performances?week=3`: each week's best games ranked by RPI-adjusted
  fantasy points (raw points, opponent RPI rank and multiplier shown). `?week=all` shows the
  season's best single games.
- **Box scores** `/week?week=3`: one week's full stat lines, with highlights and ESPN links.
- **Season** `/season`: season-to-date totals and PPG (raw, not RPI-adjusted).
- All tabs have position, draft class, and scoring (PPR / Half PPR / Standard) filters. The
  scoring choice is remembered per browser. `/rankings` redirects to `/`.

JSON endpoints (handy for Power BI or Sheets):
- `/api/rankings?scoring=ppr`: ranked prospects plus the full RPI table
- `/api/stats?week=3`: one week
- `/api/season`: season totals plus weekly breakdown

## Watchlist
`data/players.json`. Each entry:

    { "name": "Jeremiah Smith", "pos": "WR", "team": "Ohio State Buckeyes", "nflYear": 2027, "espnId": "5079720" }

- `team` must match ESPN's full team name (it's how we find the player's game each week).
- `espnId` is optional but recommended. It's the number in the player's ESPN URL
  (espn.com/college-football/player/_/id/**5079720**/jeremiah-smith). With it, matching survives
  name changes (ESPN now lists Ryan Williams as "Ryan Coleman-Williams", for example).
  Without it, the player is matched by name.
- If a player transfers, update `team`.

## Ranking system
Every prospect gets a 0–100 **Prospect Score**, recalculated as new games come in. All the
knobs are in `data/ranking.json`.

- **Opponent adjustment.** RPI is computed from every FBS result so far
  (25% win pct, 50% opponents' win pct, 25% opponents' opponents' win pct). In each game,
  yards and TDs are multiplied by 1.1 against RPI 1–40 opponents, 1.05 against 41–80, and 1
  against everyone else (including FCS). Receptions, INTs and fumbles aren't scaled.
- **Components**, each 0–100 against position benchmarks:
  - Production: opponent-adjusted fantasy PPG
  - Efficiency: QB adjusted yds/att, RB yds/touch, WR/TE receiving yards per *team* pass
    attempt (the most predictive single WR/TE stat in public prospect models). Shrunk toward
    average on small samples.
  - Market share ("dominator rating"): share of team receiving yards and TDs (WR/TE),
    scrimmage yards and TDs (RB), or rushing yards (QB, a dual-threat signal).
- **Weights** differ by position (e.g. WR 45% production, 25% efficiency, 30% market share).
  Size and speed aren't scored until combine data exists.
- **Tiers:** 80+ Elite, 65+ Starter, 50+ Upside, below that Watch.
- **Markers:** Produces vs Top 40 RPI, Volume producer, Efficient, Alpha share / Dual threat,
  plus Small sample.

Top performances has two toggles: **Points / Usage** (usage ranks games by dominator share)
and **RPI-weighted / Raw** (points and the yards/TDs shown).

Early in the season RPI is noisy (a few games per team), so the opponent tiers settle down by
midseason. ESPN doesn't publish targets, so receptions stand in for target share.

## Fantasy scoring
4 pt passing TD, 6 pt rushing/receiving TD, 1 pt per 25 passing yards, 1 pt per 10 rushing or
receiving yards, −2 per interception or fumble lost, and 1 / 0.5 / 0 per reception depending on
the preset. Presets live in `lib/scoring.js`.

## Caching
Raw ESPN responses are large (0.5–1.5 MB), so we cache each processed week instead:
finished weeks for 6 hours, the current week for 10 minutes. Editing `players.json` changes the
cache key, so a redeploy shows the new watchlist immediately.

## Run locally
    npm install
    npm run dev
Then open http://localhost:3000

## Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. On vercel.com, sign in with GitHub, choose "Add New > Project", and import the repo.
3. Keep the defaults and click Deploy. You'll get a link like `your-project.vercel.app`.

Every push to GitHub redeploys automatically. Optional: set a `SEASON` environment variable in
Vercel to pin a season (e.g. `2026`).

## Notes
ESPN's API is unofficial and undocumented. It needs no key but can change without notice.
If a player shows "No recorded stats" after a game they clearly played in, check their `team`
and `espnId`.
