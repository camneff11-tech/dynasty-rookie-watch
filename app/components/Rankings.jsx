"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { COMPONENTS, rankProspects } from "../../lib/ranking";
import { Controls, ErrorNote, Footer, Masthead, StudSticker, useFilters, useScoring } from "./shared";

const TABS = ["All", "QB", "RB", "WR", "TE"];

const num = (x, d = 1) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(d));
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);

// Table columns per tab. `sort` returns the value to sort by (null sorts last).
const CAREER = [
  { key: "prior", label: "Prior PPG", title: "PPG in the last full prior season", sort: (p) => p.metrics.career.priorPpg, show: (p) => (p.metrics.career.priorPpg == null ? "–" : `${num(p.metrics.career.priorPpg)} ('${String(p.metrics.career.priorYear).slice(2)})`) },
];
const BREAKOUT = [
  { key: "breakout", label: "Breakout", title: "Active season of first breakout (1 = first season playing)", sort: (p) => p.metrics.career.breakout?.seasonNumber ?? null, show: (p) => (p.metrics.career.breakout ? `Yr ${p.metrics.career.breakout.seasonNumber} ('${String(p.metrics.career.breakout.year).slice(2)})` : "–"), asc: true },
];
const COMMON_TAIL = [
  { key: "age", label: "Age", title: "Age on Sept 1", sort: (p) => p.metrics.age, show: (p) => num(p.metrics.age), asc: true },
  { key: "p4", label: "P4 PPG", title: "PPG vs Power 4 opponents (games)", sort: (p) => p.metrics.splits.power4.ppg, show: (p) => (p.metrics.splits.power4.games ? `${num(p.metrics.splits.power4.ppg)} (${p.metrics.splits.power4.games})` : "–") },
  { key: "board", label: "Board", title: "Big board rank (projected draft capital)", sort: (p) => p.bigBoardRank ?? null, show: (p) => p.bigBoardRank ?? "–", asc: true },
];
const COMMON_HEAD = [
  { key: "gp", label: "GP", sort: (p) => p.metrics.games, show: (p) => p.metrics.games },
  { key: "adjPpg", label: "Adj PPG", title: "RPI-adjusted fantasy points per game", sort: (p) => p.metrics.adjPpg, show: (p) => num(p.metrics.adjPpg) },
];
const COLUMNS = {
  All: [...COMMON_HEAD, ...CAREER, ...COMMON_TAIL],
  QB: [
    ...COMMON_HEAD,
    { key: "cmp", label: "Cmp%", sort: (p) => p.metrics.cmpPct, show: (p) => pct(p.metrics.cmpPct) },
    { key: "ypa", label: "Y/A", sort: (p) => p.metrics.ypa, show: (p) => num(p.metrics.ypa) },
    { key: "aya", label: "AY/A", title: "(yds + 20×TD − 45×INT) / att", sort: (p) => p.metrics.aya, show: (p) => num(p.metrics.aya) },
    { key: "tdint", label: "TD:INT", sort: (p) => p.metrics.totals.passTD - p.metrics.totals.int, show: (p) => p.metrics.tdInt ?? "–" },
    { key: "rushPts", label: "Rush pts", title: "Rushing share of fantasy points", sort: (p) => p.metrics.rushShareOfPoints, show: (p) => pct(p.metrics.rushShareOfPoints) },
    ...CAREER,
    ...COMMON_TAIL,
  ],
  RB: [
    ...COMMON_HEAD,
    { key: "scrim", label: "Scrim/play", title: "Scrimmage yards per team play", sort: (p) => p.metrics.scrimmagePerTeamPlay, show: (p) => num(p.metrics.scrimmagePerTeamPlay, 2) },
    { key: "ypc", label: "YPC", sort: (p) => p.metrics.ypc, show: (p) => num(p.metrics.ypc) },
    { key: "rushShare", label: "Rush share", title: "Share of team rushing yards", sort: (p) => p.metrics.rushShare, show: (p) => pct(p.metrics.rushShare) },
    { key: "recShare", label: "Rec share", title: "Share of team receiving yards", sort: (p) => p.metrics.recShare, show: (p) => pct(p.metrics.recShare) },
    ...CAREER,
    ...BREAKOUT,
    ...COMMON_TAIL,
  ],
  WR: [
    ...COMMON_HEAD,
    { key: "yptpa", label: "YPTPA", title: "Receiving yards per team pass attempt", sort: (p) => p.metrics.yptpa, show: (p) => num(p.metrics.yptpa, 2) },
    { key: "dom", label: "Dominator", title: "0.8 × rec yds share + 0.2 × rec TD share", sort: (p) => p.metrics.weightedDominator, show: (p) => pct(p.metrics.weightedDominator) },
    ...CAREER,
    ...BREAKOUT,
    ...COMMON_TAIL,
  ],
};
COLUMNS.TE = COLUMNS.WR;

function Flags({ p }) {
  if (p.flags.length === 0) return null;
  return (
    <ul className="markers">
      {p.flags.map((f) => (
        <li key={f.text} className={`marker ${f.kind}`}>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function Method({ config }) {
  return (
    <details className="method">
      <summary>How the Prospect Score works</summary>
      <p>
        Each prospect gets a 0–100 score: every part is scored against a fixed benchmark for the
        position, then weighted. A part with no data yet (no big board rank, no birth date, no
        Power 4 games) is left out and the others are re-weighted. Size and speed aren't scored
        until combine numbers exist.
      </p>
      <ul>
        <li><b>Draft capital:</b> big board rank (projected draft slot), entered by hand.</li>
        <li><b>Team-normalized:</b> QB adjusted yards per attempt, RB scrimmage yards per team play, WR/TE receiving yards per team pass attempt.</li>
        <li>
          <b>Production:</b> fantasy PPG with yards and TDs weighted by opponent RPI (
          {config.opponentTiers.map((t, i) => `${i === 0 ? 1 : config.opponentTiers[i - 1].upToRank + 1}–${t.upToRank}: ×${t.multiplier}`).join(", ")}; others ×1).
        </li>
        <li><b>Market share:</b> WR/TE weighted dominator (80% yards, 20% TDs), RB rush + receiving share, QB rushing share of points.</li>
        <li><b>Age:</b> age on Sept 1. Younger scores higher.</li>
        <li><b>Power 4 production:</b> PPG against ACC, Big 12, Big Ten, SEC and Notre Dame.</li>
        <li><b>Prior-season production:</b> PPG in the last full prior season (ESPN season stats), so injured or slow-starting prospects still count.</li>
        <li><b>Early breakout:</b> the first season a player reached 20% (WR) or 15% (RB/TE) of his team's production. A 1st-season breakout scores 100, 2nd 70, 3rd 40.</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            {COMPONENTS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(config.weights).map(([pos, w]) => (
            <tr key={pos}>
              <td>{pos}</td>
              {COMPONENTS.map((c) => (
                <td key={c.key}>{w[c.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default function Rankings({ rows, config, season, throughWeek, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const [tab, setTab] = useState("All");
  const [sort, setSort] = useState({ key: "score", dir: -1 });
  const filters = useFilters(rows);
  const { draftClass, query } = filters;

  // Rank within the chosen draft class; the tab and search only narrow what's shown.
  const ranked = useMemo(
    () => rankProspects(rows.filter((r) => draftClass === "All" || r.nflYear === draftClass), config, scoring),
    [rows, config, scoring, draftClass]
  );

  const columns = COLUMNS[tab];
  const q = query.trim().toLowerCase();
  const sortCol = columns.find((c) => c.key === sort.key);
  const shown = ranked
    .filter((p) => tab === "All" || p.pos === tab)
    .filter((p) => !q || `${p.name} ${p.team}`.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort.key === "score" || !sortCol) return sort.dir * (a.score - b.score);
      const va = sortCol.sort(a);
      const vb = sortCol.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sort.dir * (va - vb);
    });

  const clickSort = (col) =>
    setSort((s) => (s.key === col.key ? { key: col.key, dir: -s.dir } : { key: col.key, dir: col.asc ? 1 : -1 }));
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none");

  return (
    <main>
      <Masthead view="rankings" season={season}>
        <p className="lede">
          Prospect Score through week {throughWeek}. Click a column to sort, or a name for the full profile.
        </p>
      </Masthead>

      <nav className="subtabs" aria-label="Position">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "All" ? "All positions" : t}
          </button>
        ))}
      </nav>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} showPositions={false} />
      <Method config={config} />
      <ErrorNote errors={errors} />

      <div className="table-wrap">
        <table className="rank-table">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col" className="player-col">Player</th>
              <th scope="col" className="num" aria-sort={ariaSort("score")}>
                <button type="button" onClick={() => clickSort({ key: "score" })}>Score</button>
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="num" aria-sort={ariaSort(c.key)} title={c.title}>
                  <button type="button" onClick={() => clickSort(c)}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.espnId ?? p.name} className={p.metrics.games ? undefined : "status-no-stats"}>
                <td className="num rank">{tab === "All" ? p.overallRank : p.posRank.slice(2)}</td>
                <td className="player-col">
                  <div className="player-cell">
                    <div>
                      <p className="who-name">
                        <span className="pos">{p.posRank}</span>
                        <Link href={`/player/${p.slug}`}>{p.name}</Link>
                      </p>
                      <p className="sub">{p.team} · {p.nflYear} class</p>
                      <Flags p={p} />
                    </div>
                    {p.certified && (
                      <StudSticker
                        size="sm"
                        title={
                          p.score >= config.certifiedStud.minScore
                            ? "Certified Stud: Tier 1 prospect"
                            : `Certified Stud: ${config.certifiedStud.gamePoints}+ point game (week ${p.bigGames.join(", ")})`
                        }
                      />
                    )}
                  </div>
                </td>
                <td className="num">
                  <b className="score">{p.score.toFixed(1)}</b>
                  <span className="tier">{p.tier}</span>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="num">{c.show(p)}</td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="empty">No prospects match. Clear the search or pick another filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Footer updatedAt={updatedAt} note="Rankings update as new box scores and results come in." />
    </main>
  );
}
