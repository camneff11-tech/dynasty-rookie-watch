"use client";

import { useState } from "react";
import Link from "next/link";
import { fantasyPoints, summarize } from "../../lib/scoring";
import { Controls, ErrorNote, Footer, Masthead, useFilters, useScoring } from "./shared";

const SORTS = { total: "Total points", ppg: "Points per game" };

export default function SeasonBoard({ rows, season, throughWeek, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const [sort, setSort] = useState("total");
  const filters = useFilters(rows);

  const ranked = filters.filtered
    .map((row) => {
      const total = fantasyPoints(row.totals, scoring);
      return {
        row,
        total,
        ppg: row.gamesPlayed ? Math.round((total / row.gamesPlayed) * 10) / 10 : 0,
        byWeek: new Map(row.weeks.map((w) => [w.week, { ...w, pts: fantasyPoints(w.totals, scoring) }])),
      };
    })
    .sort((a, b) => b[sort] - a[sort] || b.total - a.total || a.row.name.localeCompare(b.row.name));

  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);

  return (
    <main>
      <Masthead view="season" season={season}>
        <p className="lede">
          Season-to-date fantasy production through week {throughWeek}.
        </p>
      </Masthead>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />

      <div className="chips sort" role="group" aria-label="Sort by">
        {Object.entries(SORTS).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>
            {label}
          </button>
        ))}
      </div>

      <ErrorNote errors={errors} />

      <ol className="board">
        {ranked.map(({ row, total, ppg, byWeek }, i) => (
          <li key={row.espnId ?? row.name} className={row.gamesPlayed ? "" : "status-no-stats"}>
            <span className="rank">{i + 1}</span>
            <div className="who">
              <p className="who-name">
                <span className="pos">{row.pos}</span>
                <b>{row.name}</b>
              </p>
              <p className="sub">
                {row.team} · {row.nflYear} class · {row.gamesPlayed} GP
              </p>
              <p className="line">{summarize(row.totals, row.pos) || "No stats yet"}</p>
              <p className="weekly" aria-label="Points by week">
                {weeks.map((n) => {
                  const w = byWeek.get(n);
                  return (
                    <Link
                      key={n}
                      href={`/week?week=${n}`}
                      title={w ? `Week ${n} vs ${w.opponent}` : `Week ${n}: no stats`}
                      className={w ? undefined : "off"}
                    >
                      <small>W{n}</small>
                      {w ? w.pts.toFixed(1) : "–"}
                    </Link>
                  );
                })}
              </p>
            </div>
            <div className="nums">
              <p className="big">
                <b>{(sort === "ppg" ? ppg : total).toFixed(1)}</b>
                <span>{sort === "ppg" ? "PPG" : "pts"}</span>
              </p>
              <p className="small">
                {sort === "ppg" ? `${total.toFixed(1)} total` : `${ppg.toFixed(1)} PPG`}
              </p>
            </div>
          </li>
        ))}
        {ranked.length === 0 && (
          <li className="empty">No prospects match. Clear the search or pick another filter.</li>
        )}
      </ol>

      <Footer updatedAt={updatedAt} note="Finished weeks refresh every 6 hours, the current week every 10 minutes." />
    </main>
  );
}
