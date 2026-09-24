import { notFound } from "next/navigation";
import { players } from "../../../lib/players";
import config from "../../../lib/model-config";
import { buildRankingInputs, getCurrentWeek } from "../../../lib/espn";
import { slugify } from "../../../lib/ranking";
import PlayerProfile from "../../components/PlayerProfile";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const player = players.find((p) => slugify(p.name) === slug);
  return { title: `${player?.name ?? "Player"} · League of Guisto Dynasty Rookie Review` };
}

export default async function PlayerPage({ params }) {
  const { slug } = await params;
  if (!players.some((p) => slugify(p.name) === slug)) notFound();

  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;
  // The whole watchlist comes along so percentiles are computed against position peers.
  const { rows, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });

  return (
    <PlayerProfile rows={rows} slug={slug} config={config} season={season} errors={errors} updatedAt={updatedAt} />
  );
}
