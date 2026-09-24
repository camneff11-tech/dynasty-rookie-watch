// Prospect model settings. Edit weights and benchmarks here; everything else reads them.
//
// Each component is scored 0–100 against a fixed benchmark range per position
// ([floor, elite]; a reversed range like [23.5, 19.5] means lower is better). The
// composite is the weighted average of the components that have data. A missing
// component (no bigBoardRank yet, no dob, no Power 4 games) drops out and the rest are
// re-weighted, never treated as zero. Weights don't need to add to 100.

const MODEL_CONFIG = {
  // Opponent strength, part 1: RPI multipliers on yards and TDs for the Production
  // component (RPI is computed from every FBS result this season). Everyone else is x1.
  opponentTiers: [
    { upToRank: 25, multiplier: 1.25, label: "Top 25 RPI" },
    { upToRank: 50, multiplier: 1.15, label: "RPI 26-50" },
    { upToRank: 75, multiplier: 1.1, label: "RPI 51-75" },
    { upToRank: 100, multiplier: 1.05, label: "RPI 76-100" },
  ],

  // Opponent strength, part 2: Power 4 splits. ESPN conference ids: 1 ACC, 4 Big 12,
  // 5 Big Ten, 8 SEC. Notre Dame (an Independent) is counted as Power 4.
  power4: {
    conferenceIds: ["1", "4", "5", "8"],
    teams: ["Notre Dame Fighting Irish"],
  },

  // Component weights per position. Draft capital is highest, then team-normalized
  // production, RPI-adjusted fantasy production, market share, age, and Power 4 production.
  // Prior production (last full prior season) and early breakout come from past seasons.
  weights: {
    QB: { draftCapital: 28, teamNormalized: 16, production: 20, share: 10, age: 6, power4: 8, priorProduction: 12, breakout: 0 },
    RB: { draftCapital: 26, teamNormalized: 16, production: 16, share: 12, age: 6, power4: 8, priorProduction: 8, breakout: 8 },
    WR: { draftCapital: 26, teamNormalized: 16, production: 14, share: 14, age: 6, power4: 8, priorProduction: 8, breakout: 8 },
    TE: { draftCapital: 26, teamNormalized: 16, production: 14, share: 14, age: 6, power4: 8, priorProduction: 8, breakout: 8 },
  },

  // Shared benchmarks.
  draftCapital: [150, 1], // bigBoardRank: 1 = 100, 150th or later = 0
  age: [23.5, 19.5], // age at Sept 1: 19.5 or younger = 100, 23.5 or older = 0

  // Per-position benchmarks. `teamNormalized` and `share` name the metric they use
  // (see lib/metrics.js). `sample` shrinks small-sample ratios toward the middle of the
  // range until that much volume has piled up.
  benchmarks: {
    QB: {
      production: [10, 32],
      power4: [10, 32],
      teamNormalized: { metric: "aya", label: "Adj. yds/att", range: [6, 13], sample: 30 },
      share: { metric: "rushShareOfPoints", label: "Rush share of pts", range: [0, 0.4] },
    },
    RB: {
      production: [8, 32],
      power4: [8, 32],
      teamNormalized: { metric: "scrimmagePerTeamPlay", label: "Scrim yds/team play", range: [0.5, 2.5], sample: 60 },
      share: { metric: "rbShare", label: "Rush/rec share", range: [0.15, 0.5] },
    },
    WR: {
      production: [8, 32],
      power4: [8, 32],
      teamNormalized: { metric: "yptpa", label: "Rec yds/team pass att", range: [1.0, 4.5], sample: 60 },
      share: { metric: "weightedDominator", label: "Dominator", range: [0.1, 0.45] },
    },
    TE: {
      production: [5, 20],
      power4: [5, 20],
      teamNormalized: { metric: "yptpa", label: "Rec yds/team pass att", range: [0.5, 2.5], sample: 60 },
      share: { metric: "weightedDominator", label: "Dominator", range: [0.05, 0.3] },
    },
  },

  // RB share component = rush share and receiving share, blended.
  rbShareBlend: { rush: 0.6, rec: 0.4 },

  // Breakout: a season at or above this market share (WR/TE weighted dominator; RB
  // scrimmage dominator). breakoutDominator is the current-season WR/TE flag.
  breakoutDominator: 0.2,
  breakout: { WR: 0.2, TE: 0.15, RB: 0.15 },
  // Early-breakout score by the active season it happened in (1 = first season playing).
  // No breakout after 2+ active seasons scores 0; otherwise it's too early to say (no data).
  breakoutScore: { 1: 100, 2: 70, 3: 40, 4: 15 },

  // QB archetype by rushing share of fantasy points.
  qbArchetypes: [
    { below: 0.1, label: "Pocket" },
    { below: 0.25, label: "Balanced" },
    { below: Infinity, label: "Dual-threat" },
  ],

  tiers: [
    { min: 80, label: "Tier 1 · Elite" },
    { min: 65, label: "Tier 2 · Starter" },
    { min: 50, label: "Tier 3 · Upside" },
    { min: 0, label: "Tier 4 · Watch" },
  ],

  smallSampleGames: 3,

  // Studs & Duds tab.
  studsDuds: { count: 10, minBaseline: 8 },

  // "Certified Stud" sticker: every Tier 1 prospect (score >= minScore), and any single
  // game with more than `gamePoints` raw fantasy points (in the chosen scoring format).
  certifiedStud: { minScore: 80, gamePoints: 30 },
};

export default MODEL_CONFIG;
