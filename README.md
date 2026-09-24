# Dynasty Rookie Watch: 2027 class

Weekly and season-to-date fantasy production for 2027 NFL draft prospects (plus a few 2028
devy names), pulled live from ESPN's public college football API.

## Pages
- `/`: one week at a time (`/?week=3`), players sorted by fantasy points, with box score lines,
  a highlights search link, and the ESPN box score link.
- `/season`: season-to-date leaderboard (total points or PPG) with a week-by-week strip.
- Both have position, draft class, and scoring (PPR / Half PPR / Standard) filters. The scoring
  choice is remembered per browser.

JSON endpoints (handy for Power BI or Sheets):
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
