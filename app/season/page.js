import players from "../../data/players.json";
import { buildSeason, getCurrentWeek } from "../../lib/espn";
import SeasonBoard from "../components/SeasonBoard";

// Render per request; the week data underneath is cached (see lib/espn.js).
export const dynamic = "force-dynamic";

export const metadata = { title: "Season leaderboard · Dynasty Rookie Watch" };

export default async function SeasonPage() {
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, errors, updatedAt } = await buildSeason({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });

  return (
    <SeasonBoard
      rows={rows}
      season={season}
      throughWeek={current.week}
      errors={errors}
      updatedAt={updatedAt}
    />
  );
}
