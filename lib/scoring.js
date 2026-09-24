// Fantasy scoring presets. Totals come from lib/espn.js (raw box score counting stats).
export const SCORING = {
  ppr: { label: "PPR", rec: 1 },
  half: { label: "Half PPR", rec: 0.5 },
  std: { label: "Standard", rec: 0 },
};

export const DEFAULT_SCORING = "ppr";

export function fantasyPoints(t, scoring = DEFAULT_SCORING) {
  const rec = SCORING[scoring]?.rec ?? 1;
  const pts =
    t.passYds / 25 +
    t.passTD * 4 -
    t.int * 2 +
    t.rushYds / 10 +
    t.rushTD * 6 +
    t.rec * rec +
    t.recYds / 10 +
    t.recTD * 6 -
    t.fumLost * 2;
  return Math.round(pts * 10) / 10;
}

// Yards round to whole numbers; RPI-weighted TDs keep a decimal (e.g. 2.2 TD).
const td = (x) => (Number.isInteger(x) ? x : x.toFixed(1));
const yds = (x) => Math.round(x);

// A short, position-aware stat line, e.g. "18/22, 241 yds, 2 TD" or "5 rec, 85 yds".
export function summarize(t, pos) {
  const parts = [];
  if (t.passAtt > 0) {
    parts.push(`${t.passCmp}/${t.passAtt}, ${yds(t.passYds)} pass yds, ${td(t.passTD)} TD, ${t.int} INT`);
  }
  if (t.rushAtt > 0 && (pos !== "QB" || t.rushYds !== 0 || t.rushTD > 0)) {
    parts.push(`${t.rushAtt} car, ${yds(t.rushYds)} rush yds${t.rushTD ? `, ${td(t.rushTD)} TD` : ""}`);
  }
  if (t.rec > 0) {
    parts.push(`${t.rec} rec, ${yds(t.recYds)} yds${t.recTD ? `, ${td(t.recTD)} TD` : ""}`);
  }
  return parts.join(" · ");
}
