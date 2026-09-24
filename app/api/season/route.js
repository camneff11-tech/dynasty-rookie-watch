import { players } from "../../../lib/players";
import { buildSeason, getCurrentWeek } from "../../../lib/espn";

// GET /api/season -> season-to-date totals per player, with a week-by-week breakdown
export async function GET() {
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const data = await buildSeason({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });
  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" },
  });
}
