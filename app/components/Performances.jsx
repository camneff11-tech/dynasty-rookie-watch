"use client";

import { useMemo } from "react";
import Link from "next/link";
import { gamePerformance } from "../../lib/ranking";
import { summarize } from "../../lib/scoring";
import { Controls, ErrorNote, Footer, Masthead, useFilters, useScoring } from "./shared";

const SEASON_LIMIT = 50;

export default function Performances({ games, config, season, week, throughWeek, playedWeeks, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const inView = useMemo(
    () => (week === "all" ? games : games.filter((g) => g.week === week)),
    [games, week]
  );
  const filters = useFilters(inView);

  const ranked = filters.filtered
    .map((g) => gamePerformance(g, config, scoring))
    .sort((a, b) => b.adj - a.adj || b.raw - a.raw || a.name.localeCompare(b.name));
  const shown = week === "all" ? ranked.slice(0, SEASON_LIMIT) : ranked;

  return (
    <main>
      <Masthead view="performances" season={season}>
        <p className="lede">
          {week === "all"
            ? `Best single games of the season, through week ${throughWeek}, ranked by RPI-adjusted points.`
            : `Week ${week}'s best games, ranked by RPI-adjusted points.`}
        </p>
      </Masthead>

      <nav className="weeks" aria-label="Choose week">
        <Link href="/performances?week=all" aria-current={week === "all" ? "page" : undefined} className="all">
          Season
        </Link>
        {Array.from({ length: throughWeek }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={`/performances?week=${n}`}
            aria-current={n === week ? "page" : undefined}
            className={playedWeeks.includes(n) ? undefined : "future"}
          >
            {n}
          </Link>
        ))}
      </nav>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />
      <p className="legend">
        {config.opponentTiers
          .map((t, i) => `RPI ${i === 0 ? 1 : config.opponentTiers[i - 1].upToRank + 1}–${t.upToRank}: ×${t.multiplier}`)
          .join(" · ")}{" "}
        · everyone else ×1 (yards and TDs)
      </p>
      <ErrorNote errors={errors} />

      <ol className="board">
        {shown.map((g, i) => (
          <li key={`${g.espnId ?? g.name}-${g.week}`}>
            <span className="rank">{i + 1}</span>
            <div className="who">
              <p className="who-name">
                <span className="pos">{g.pos}</span>
                <b>{g.name}</b>
              </p>
              <p className="sub">
                {g.team} · {g.nflYear} class
              </p>
              <p className="line">
                {week === "all" && <>Week {g.week} · </>}
                vs {g.opponent}{" "}
                <span className={g.mult > 1 ? "rpi boosted" : "rpi"}>
                  {g.oppRank ? `RPI #${g.oppRank}` : "FCS / unranked"}
                </span>
                {g.live && <span className="rpi"> live</span>}
              </p>
              <p className="line muted">{summarize(g.totals, g.pos) || "No offensive stats"}</p>
            </div>
            <div className="nums">
              <p className="big">
                <b>{g.adj.toFixed(1)}</b>
                <span>adj pts</span>
              </p>
              <p className="small">
                {g.mult > 1 ? `${g.raw.toFixed(1)} raw ×${g.mult}` : `${g.raw.toFixed(1)} raw`}
              </p>
            </div>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="empty">
            {inView.length === 0
              ? "No games played yet this week. Pick an earlier week."
              : "No performances match. Clear the search or pick another filter."}
          </li>
        )}
      </ol>
      {week === "all" && ranked.length > SEASON_LIMIT && (
        <p className="empty">Showing the top {SEASON_LIMIT} of {ranked.length} games.</p>
      )}

      <Footer updatedAt={updatedAt} note="Adjusted with this season's RPI, recalculated as results come in." />
    </main>
  );
}
