import { players } from "../../lib/players";
import config from "../../lib/model-config";
import { buildRankingInputs, getCurrentWeek } from "../../lib/espn";
import StudsDuds from "../components/StudsDuds";

export const metadata = { title: "Studs & Duds · League of Guisto Dynasty Rookie Review" };

export default async function StudsPage({ searchParams }) {
  const sp = await searchParams;
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });
  const playedWeeks = [...new Set(rows.flatMap((r) => r.weeks.map((w) => w.week)))].sort((a, b) => a - b);

  // Default to the latest week with games in it.
  const requested = Number(sp?.week);
  const week =
    requested >= 1 && requested <= current.week ? Math.floor(requested) : (playedWeeks.at(-1) ?? current.week);

  return (
    <StudsDuds
      rows={rows}
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
