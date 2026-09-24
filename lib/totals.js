// Raw counting stats per player (or team) per game. Shared by server and browser code.
export const EMPTY_TOTALS = {
  passCmp: 0, passAtt: 0, passYds: 0, passTD: 0, int: 0,
  rushAtt: 0, rushYds: 0, rushTD: 0,
  rec: 0, recYds: 0, recTD: 0,
  fumLost: 0,
};

export function addTotals(a, b) {
  const out = { ...a };
  for (const k of Object.keys(EMPTY_TOTALS)) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
}
