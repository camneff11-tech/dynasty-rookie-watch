import { players } from "../../lib/players";
import config from "../../lib/model-config";
import { buildRankingInputs, getCurrentWeek } from "../../lib/espn";
import Performances from "../components/Performances";

export const metadata = { title: "Top performances · League of Guisto Dynasty Rookie Review" };

export default async function PerformancesPage({ searchParams }) {
  const sp = await searchParams;
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });

  // One entry per player-game, carrying the player fields the filters need.
  const games = rows.flatMap(({ weeks, totals, gamesPlayed, ...player }) =>
    weeks.map((w) => ({ ...player, ...w }))
  );
  const playedWeeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

  // Default to the latest week that has games in it (early in a week, that's last week).
  const requested = sp?.week === "all" ? "all" : Number(sp?.week);
  const week =
    requested === "all"
      ? "all"
      : requested >= 1 && requested <= current.week
        ? Math.floor(requested)
        : (playedWeeks.at(-1) ?? current.week);

  return (
    <Performances
      games={games}
      config={config}
      season={season}
      week={week}
      throughWeek={current.week}
      playedWeeks={playedWeeks}
      errors={errors}
      updatedAt={updatedAt}
    />
  );
}
