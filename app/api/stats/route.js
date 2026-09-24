import players from "../../../data/players.json";
import { buildWeek, getCurrentWeek } from "../../../lib/espn";

// GET /api/stats?week=3  -> JSON rows for that week (defaults to ESPN's current week)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const current = await getCurrentWeek();
  const season =
    Number(searchParams.get("season")) || Number(process.env.SEASON) || current.season;
  const week = Number(searchParams.get("week")) || current.week;

  const data = await buildWeek({ season, week, players, currentWeek: current.week });
  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" },
  });
}
