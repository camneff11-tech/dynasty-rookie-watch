import players from "../../data/players.json";
import { buildWeek, getCurrentWeek, REGULAR_SEASON_WEEKS } from "../../lib/espn";
import Tracker from "../components/Tracker";

export const metadata = { title: "Box scores · League of Guisto Dynasty Rookie Review" };

export default async function WeekPage({ searchParams }) {
  const sp = await searchParams;
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;
  const requested = Number(sp?.week);
  const week =
    requested >= 1 && requested <= REGULAR_SEASON_WEEKS ? Math.floor(requested) : current.week;

  const { rows, errors, updatedAt } = await buildWeek({
    season,
    week,
    players,
    currentWeek: current.week,
  });

  return (
    <Tracker
      rows={rows}
      week={week}
      season={season}
      currentWeek={current.week}
      weeks={REGULAR_SEASON_WEEKS}
      errors={errors}
      updatedAt={updatedAt}
    />
  );
}
