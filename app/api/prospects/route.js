import { players } from "../../../lib/players";
import config from "../../../lib/model-config";
import { buildRankingInputs, getCurrentWeek } from "../../../lib/espn";
import { rankProspects } from "../../../lib/ranking";
import { SCORING } from "../../../lib/scoring";

// GET /api/prospects?pos=WR&scoring=ppr&class=2027
// Flat season metrics and scores per prospect (one row each), shaped for Power BI / Sheets.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pos = searchParams.get("pos")?.toUpperCase() || null;
  const draftClass = Number(searchParams.get("class")) || null;
  const scoring = SCORING[searchParams.get("scoring")] ? searchParams.get("scoring") : "ppr";
  const current = await getCurrentWeek();
  const season = Number(process.env.SEASON) || current.season;

  const { rows, errors, updatedAt } = await buildRankingInputs({
    season,
    throughWeek: current.week,
    players,
    currentWeek: current.week,
  });

  const ranked = rankProspects(
    rows.filter((r) => !draftClass || r.nflYear === draftClass),
    config,
    scoring
  ).filter((p) => !pos || p.pos === pos);

  const prospects = ranked.map((p) => {
    const m = p.metrics;
    return {
      overallRank: p.overallRank,
      posRank: p.posRank,
      name: p.name,
      pos: p.pos,
      team: p.team,
      nflYear: p.nflYear,
      espnId: p.espnId ?? null,
      bigBoardRank: p.bigBoardRank ?? null,
      earlyDeclareEligible: p.earlyDeclareEligible ?? null,
      score: p.score,
      tier: p.tier,
      certifiedStud: p.certified,
      games: m.games,
      ppg: m.ppg,
      adjPpg: m.adjPpg,
      age: m.age,
      power4Games: m.splits.power4.games,
      power4Ppg: m.splits.power4.ppg,
      otherGames: m.splits.other.games,
      otherPpg: m.splits.other.ppg,
      yptpa: m.yptpa,
      weightedDominator: m.weightedDominator,
      breakout: m.breakout.flag,
      scrimmagePerTeamPlay: m.scrimmagePerTeamPlay,
      ypc: m.ypc,
      rushShare: m.rushShare,
      recShare: m.recShare,
      cmpPct: m.cmpPct,
      ypa: m.ypa,
      aya: m.aya,
      tdInt: m.tdInt,
      rushShareOfPoints: m.rushShareOfPoints,
      archetype: m.archetype,
      priorPpg: m.career.priorPpg,
      priorYear: m.career.priorYear,
      breakoutYear: m.career.breakout?.year ?? null,
      breakoutSeasonNumber: m.career.breakout?.seasonNumber ?? null,
      breakoutAge: m.career.breakout?.age ?? null,
      activeSeasons: m.career.activeSeasons,
      ...Object.fromEntries(Object.entries(p.components).map(([k, v]) => [`score_${k}`, v])),
      ...Object.fromEntries(Object.entries(p.percentiles).map(([k, v]) => [`pctl_${k}`, v])),
      flags: p.flags.map((f) => f.text).join("; "),
      ...(p.extras ?? {}),
    };
  });

  return Response.json(
    { season, scoring, count: prospects.length, prospects, errors, updatedAt },
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } }
  );
}
