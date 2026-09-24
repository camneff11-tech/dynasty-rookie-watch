import { players } from "../../../lib/players";
import config from "../../../lib/model-config";
import { buildRankingInputs, getCurrentWeek } from "../../../lib/espn";
import { rankProspects } from "../../../lib/ranking";
import { SCORING } from "../../../lib/scoring";

// GET /api/rankings?scoring=ppr -> ranked prospects plus the RPI table used for weighting
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scoring = SCORING[searchParams.get("scoring")] ? searchParams.get("scoring") : "ppr";
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, rpi, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });
  const prospects = rankProspects(rows, config, scoring).map(({ metrics, ...p }) => ({
    ...p,
    metrics: { ...metrics, gamesDetail: undefined },
  }));

  return Response.json(
    { scoring, prospects, rpi, errors, updatedAt },
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } }
  );
}
