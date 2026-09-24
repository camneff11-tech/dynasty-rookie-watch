import players from "../../data/players.json";
import config from "../../data/ranking.json";
import { buildRankingInputs, getCurrentWeek } from "../../lib/espn";
import Rankings from "../components/Rankings";

// Render per request; the week data underneath is cached (see lib/espn.js).
export const dynamic = "force-dynamic";

export const metadata = { title: "Prospect rankings · League of Guisto Dynasty Rookie Review" };

export default async function RankingsPage() {
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });

  return (
    <Rankings
      rows={rows}
      config={config}
      season={season}
      throughWeek={current.week}
      errors={errors}
      updatedAt={updatedAt}
    />
  );
}
