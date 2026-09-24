import { describe, expect, it } from "vitest";
import fixture from "../fixtures/summary-sample.json";
import coreFixture from "../fixtures/core-season-sample.json";
import {
  extractPlayerStats,
  extractTeamTotals,
  opponentConferenceId,
  teamIdFromRef,
  totalsFromCoreStats,
  totalsFromLines,
} from "./boxscore";
import {
  adjust,
  ageOn,
  careerMetrics,
  seasonDominator,
  gamePerformance,
  isPower4,
  qbMetrics,
  rbMetrics,
  receiverMetrics,
  seasonMetrics,
  weightedDominator,
} from "./metrics";
import { mergeExtras } from "./players";
import { certifiedDudKeys, percentile, rankProspects, scale, scoreProspect, studsAndDuds } from "./ranking";
import config from "./model-config";
import { fantasyPoints } from "./scoring";

// Fixture: Texas Longhorns vs UTSA Roadrunners, 2026 week 3 (ESPN event 401856693).
const TEXAS = "Texas Longhorns";
const coleman = { name: "Cam Coleman", pos: "WR", team: TEXAS, espnId: "5079376" };
const manning = { name: "Arch Manning", pos: "QB", team: TEXAS, espnId: "4870906" };
const smothers = { name: "Hollywood Smothers", pos: "RB", team: TEXAS }; // name match, no id

const colemanTotals = totalsFromLines(extractPlayerStats(fixture, coleman));
const manningTotals = totalsFromLines(extractPlayerStats(fixture, manning));
const smothersTotals = totalsFromLines(extractPlayerStats(fixture, smothers));
const texas = extractTeamTotals(fixture, TEXAS);

describe("box score parsing (fixture)", () => {
  it("reads a receiver's line by ESPN id", () => {
    expect(colemanTotals).toMatchObject({ rec: 4, recYds: 59, recTD: 2 });
  });

  it("reads a QB's passing and rushing lines", () => {
    expect(manningTotals).toMatchObject({ passCmp: 16, passAtt: 32, passYds: 161, passTD: 2, int: 0 });
    expect(manningTotals.rushAtt).toBe(10);
    expect(manningTotals.rushYds).toBe(53);
  });

  it("falls back to name matching without an id", () => {
    expect(smothersTotals.rushAtt).toBe(10);
    expect(smothersTotals.rushYds).toBe(54);
  });

  it("reads team totals from the category totals rows", () => {
    // Matches boxscore.teams: completionAttempts "17/34", netPassingYards 169, rushing 49 for 231.
    expect(texas).toMatchObject({ passCmp: 17, passAtt: 34, passYds: 169, rushAtt: 49, rushYds: 231 });
    expect(texas.recYds).toBe(169);
    expect(texas.recTD).toBe(2);
  });

  it("finds the opponent's conference id", () => {
    expect(opponentConferenceId(fixture, TEXAS)).toBe("151"); // UTSA, American
    expect(opponentConferenceId(fixture, "UTSA Roadrunners")).toBe("8"); // Texas, SEC
  });

  it("never throws on missing data", () => {
    expect(extractPlayerStats({}, coleman)).toEqual([]);
    expect(extractTeamTotals({}, TEXAS)).toBeNull();
    expect(totalsFromLines(undefined).rec).toBe(0);
  });
});

describe("WR/TE metrics", () => {
  it("computes YPTPA and weighted dominator", () => {
    const m = receiverMetrics(colemanTotals, texas);
    expect(m.yptpa).toBeCloseTo(59 / 34, 5);
    expect(m.weightedDominator).toBeCloseTo(0.8 * (59 / 169) + 0.2 * (2 / 2), 5);
  });

  it("uses the yards share alone when the team has no receiving TDs", () => {
    expect(weightedDominator({ recYds: 50, recTD: 0 }, { recYds: 200, recTD: 0 })).toBeCloseTo(0.25);
  });

  it("returns nulls without team totals", () => {
    expect(receiverMetrics(colemanTotals, null)).toMatchObject({ yptpa: null, weightedDominator: null });
  });
});

describe("RB metrics", () => {
  it("computes scrimmage per team play, YPC and shares", () => {
    const m = rbMetrics(smothersTotals, texas);
    const plays = texas.passAtt + texas.rushAtt;
    expect(m.scrimmagePerTeamPlay).toBeCloseTo((smothersTotals.rushYds + smothersTotals.recYds) / plays, 5);
    expect(m.ypc).toBeCloseTo(5.4, 5);
    expect(m.rushShare).toBeCloseTo(54 / 231, 5);
    expect(m.recShare).toBeCloseTo(smothersTotals.recYds / 169, 5);
  });
});

describe("QB metrics", () => {
  it("computes efficiency, TD:INT and archetype", () => {
    const m = qbMetrics(manningTotals, "ppr", config.qbArchetypes);
    expect(m.cmpPct).toBeCloseTo(0.5, 5);
    expect(m.ypa).toBeCloseTo(161 / 32, 5);
    expect(m.aya).toBeCloseTo((161 + 40) / 32, 5);
    expect(m.tdInt).toBe("2:0");
    // 5.3 rush pts of 19.7 total (points round to 0.1) -> ~27% -> Dual-threat
    expect(m.rushShareOfPoints).toBeCloseTo(5.3 / fantasyPoints(manningTotals, "ppr"), 5);
    expect(m.archetype).toBe("Dual-threat");
  });

  it("labels pocket and balanced passers", () => {
    const base = { passCmp: 20, passAtt: 30, passYds: 300, passTD: 3, int: 0, rushAtt: 2, rushYds: 5, rushTD: 0, rec: 0, recYds: 0, recTD: 0, fumLost: 0 };
    expect(qbMetrics(base, "ppr", config.qbArchetypes).archetype).toBe("Pocket");
    expect(qbMetrics({ ...base, rushYds: 60 }, "ppr", config.qbArchetypes).archetype).toBe("Balanced");
  });
});

describe("age, opponents, RPI adjustment", () => {
  it("computes age on Sept 1 of the season", () => {
    expect(ageOn("2006-09-01", 2026)).toBe(20);
    expect(ageOn("2006-03-01", 2026)).toBeCloseTo(20.5, 1);
    expect(ageOn(undefined, 2026)).toBeNull();
    expect(ageOn("not a date", 2026)).toBeNull();
  });

  it("tags Power 4 opponents, including Notre Dame", () => {
    expect(isPower4({ opponent: "LSU Tigers", opponentConferenceId: "8" }, config)).toBe(true);
    expect(isPower4({ opponent: "UTSA Roadrunners", opponentConferenceId: "151" }, config)).toBe(false);
    expect(isPower4({ opponent: "Notre Dame Fighting Irish", opponentConferenceId: "18" }, config)).toBe(true);
    expect(isPower4({ opponent: "Mystery U", opponentConferenceId: null }, config)).toBe(false);
  });

  it("scales only yards and TDs by the RPI multiplier", () => {
    const a = adjust(colemanTotals, 1.1);
    expect(a.recYds).toBeCloseTo(64.9, 5);
    expect(a.recTD).toBeCloseTo(2.2, 5);
    expect(a.rec).toBe(4);
  });

  it("applies the multiplier by opponent RPI rank", () => {
    const week = { week: 3, opponent: "UTSA Roadrunners", totals: colemanTotals, teamTotals: texas, pos: "WR" };
    expect(gamePerformance({ ...week, oppRank: 12 }, config).mult).toBe(1.25);
    expect(gamePerformance({ ...week, oppRank: 25 }, config).mult).toBe(1.25);
    expect(gamePerformance({ ...week, oppRank: 26 }, config).mult).toBe(1.15);
    expect(gamePerformance({ ...week, oppRank: 60 }, config).mult).toBe(1.1);
    expect(gamePerformance({ ...week, oppRank: 100 }, config).mult).toBe(1.05);
    expect(gamePerformance({ ...week, oppRank: 101 }, config).mult).toBe(1);
    expect(gamePerformance({ ...week, oppRank: null }, config).mult).toBe(1);
  });
});

// A season row built from the fixture game.
function seasonRow(player, totals, extra = {}) {
  return {
    ...player,
    nflYear: 2027,
    season: 2026,
    weeks: [{ week: 3, opponent: "UTSA Roadrunners", opponentConferenceId: "151", oppRank: 46, totals, teamTotals: texas }],
    ...extra,
  };
}

describe("season metrics and composite", () => {
  it("builds season metrics with Power 4 splits and breakout", () => {
    const m = seasonMetrics(seasonRow(coleman, colemanTotals, { dob: "2006-04-10" }), config);
    expect(m.games).toBe(1);
    expect(m.splits.power4.games).toBe(0);
    expect(m.splits.other.games).toBe(1);
    expect(m.breakout.flag).toBe(true);
    expect(m.age).toBeCloseTo(20.4, 1);
  });

  it("re-weights missing components instead of zeroing them", () => {
    const p = scoreProspect(seasonRow(coleman, colemanTotals), config);
    expect(p.components.draftCapital).toBeNull(); // no bigBoardRank
    expect(p.components.age).toBeNull(); // no dob
    expect(p.components.power4).toBeNull(); // no Power 4 games
    expect(p.score).toBeGreaterThan(0);
    const withBoard = scoreProspect(seasonRow(coleman, colemanTotals, { bigBoardRank: 1 }), config);
    expect(withBoard.components.draftCapital).toBe(100);
    expect(withBoard.score).toBeGreaterThan(p.score);
  });

  it("flags small samples", () => {
    const p = scoreProspect(seasonRow(coleman, colemanTotals), config);
    expect(p.flags.map((f) => f.text)).toContain("Small sample");
  });

  it("handles a player with no games", () => {
    const p = scoreProspect({ ...coleman, nflYear: 2027, season: 2026, weeks: [] }, config);
    expect(p.metrics.games).toBe(0);
    expect(p.metrics.yptpa).toBeNull();
    expect(Number.isFinite(p.score)).toBe(true);
  });

  it("ranks and adds within-position percentiles", () => {
    const rows = [
      seasonRow(coleman, colemanTotals, { bigBoardRank: 10 }),
      seasonRow({ ...coleman, name: "Other WR", espnId: "x" }, { ...colemanTotals, recYds: 10, rec: 1, recTD: 0 }, { bigBoardRank: 50 }),
    ];
    const ranked = rankProspects(rows, config);
    expect(ranked[0].name).toBe("Cam Coleman");
    expect(ranked[0].percentiles.draftCapital).toBe(100); // lower board rank is better
    expect(ranked[1].percentiles.draftCapital).toBe(0);
  });
});

describe("helpers", () => {
  it("scales against a benchmark range (and reversed ranges)", () => {
    expect(scale(5, [0, 10])).toBe(50);
    expect(scale(20, [0, 10])).toBe(100);
    expect(scale(19.5, [23.5, 19.5])).toBe(100);
    expect(scale(null, [0, 10])).toBeNull();
  });

  it("computes percentiles", () => {
    expect(percentile(3, [1, 2, 3])).toBe(100);
    expect(percentile(1, [1, 2, 3])).toBe(0);
    expect(percentile(1, [1])).toBeNull();
  });

  it("merges extra columns by normalized name", () => {
    const merged = mergeExtras([{ name: "Bryant Wesco Jr." }, { name: "KJ Duff" }], [{ name: "Bryant Wesco", yprr: 2.9 }]);
    expect(merged[0].extras).toEqual({ yprr: 2.9 });
    expect(merged[1].extras).toBeUndefined();
  });

  it("finds studs and duds against each player's own average", () => {
    const mk = (name, weeks) => ({ name, pos: "WR", team: TEXAS, nflYear: 2027, season: 2026, weeks });
    const g = (week, recYds) => ({ week, opponent: "X", oppRank: null, totals: { ...colemanTotals, recYds, recTD: 0, rec: 5 }, teamTotals: texas });
    const rows = [mk("Steady", [g(1, 100), g(2, 100)]), mk("Crash", [g(1, 200), g(2, 20)])];
    const { studs, duds } = studsAndDuds(rows, 2, config);
    expect(studs[0].name).toBe("Steady");
    expect(duds[0].name).toBe("Crash");
    expect(duds[0].delta).toBeLessThan(0);
    expect(duds[0].certifiedDud).toBe(true);
    // The same game is a Certified Dud everywhere; Steady's games never are.
    const keys = certifiedDudKeys(rows, config);
    expect(keys.has("Crash:2")).toBe(true);
    expect([...keys].some((k) => k.startsWith("Steady"))).toBe(false);
  });
});

// Core API fixture: Ahmad Hardy (RB), 2025 at Missouri, plus Missouri's 2025 team totals.
describe("career (prior seasons)", () => {
  const hardy = totalsFromCoreStats(coreFixture.athleteStats);
  const mizzou = totalsFromCoreStats(coreFixture.teamStats);

  it("parses core API season stats", () => {
    expect(hardy.games).toBe(12);
    expect(hardy.totals).toMatchObject({ rushAtt: 241, rushYds: 1560, rushTD: 16, rec: 6, recYds: 22 });
    expect(mizzou.totals).toMatchObject({ passAtt: 339, rushYds: 2809, recYds: 2343, recTD: 15 });
    expect(teamIdFromRef(coreFixture.athlete.team.$ref)).toBe("142");
    expect(totalsFromCoreStats(null).games).toBe(0);
  });

  it("computes RB season market share", () => {
    const expected = 0.8 * ((1560 + 22) / (2809 + 2343)) + 0.2 * (16 / (30 + 15));
    expect(seasonDominator(hardy.totals, mizzou.totals, "RB")).toBeCloseTo(expected, 5);
    expect(seasonDominator(hardy.totals, mizzou.totals, "QB")).toBeNull();
  });

  const hardyRow = (weeks = []) => ({
    name: "Ahmad Hardy",
    pos: "RB",
    team: "Missouri Tigers",
    nflYear: 2027,
    season: 2026,
    bigBoardRank: 60,
    weeks,
    career: [
      { year: 2024, team: "UL Monroe Warhawks", games: 12, totals: { ...hardy.totals, rushYds: 1351, rushTD: 13 }, teamTotals: { ...mizzou.totals, rushYds: 1929, recYds: 1925, rushTD: 12, recTD: 15 } },
      { year: 2025, team: "Missouri Tigers", games: 12, totals: hardy.totals, teamTotals: mizzou.totals },
    ],
  });

  it("finds the breakout season and prior production", () => {
    const current = seasonMetrics(hardyRow(), config);
    const c = careerMetrics(hardyRow(), current, config);
    expect(c.activeSeasons).toBe(2);
    expect(c.breakout).toMatchObject({ year: 2024, seasonNumber: 1 });
    expect(c.priorYear).toBe(2025);
    expect(c.priorPpg).toBeCloseTo((1560 / 10 + 16 * 6 + 6 + 22 / 10) / 12, 1);
  });

  it("scores an injured prospect on prior seasons instead of dropping him", () => {
    const p = scoreProspect(hardyRow(), config);
    expect(p.metrics.games).toBe(0);
    expect(p.components.production).toBeNull();
    expect(p.components.breakout).toBe(100);
    expect(p.components.priorProduction).toBeGreaterThan(50);
    expect(p.score).toBeGreaterThan(50);
    expect(p.flags.map((f) => f.text)).toContain("No 2026 games yet");
  });

  it("gives no breakout credit yet to a first-year player", () => {
    const p = scoreProspect({ ...hardyRow(), career: [] }, config);
    expect(p.components.breakout).toBeNull();
  });
});
