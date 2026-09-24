"use client";

import { useMemo } from "react";
import Link from "next/link";
import { studsAndDuds } from "../../lib/ranking";
import { summarize } from "../../lib/scoring";
import { Controls, DudSticker, ErrorNote, Footer, Masthead, StudSticker, useFilters, useScoring } from "./shared";

function GameRow({ g, i, kind, config }) {
  return (
    <li>
      <span className="rank">{i + 1}</span>
      <div className="who">
        <p className="who-name">
          <span className="pos">{g.pos}</span>
          <Link href={`/player/${g.slug}`}>{g.name}</Link>
        </p>
        <p className="sub">
          {g.team} · {g.nflYear} class
        </p>
        <p className="line">
          vs {g.opponent}{" "}
          <span className={g.mult > 1 ? "rpi boosted" : "rpi"}>{g.oppRank ? `RPI #${g.oppRank}` : "FCS / unranked"}</span>
        </p>
        <p className="line muted">{summarize(g.totals, g.pos) || "No offensive stats"}</p>
      </div>
      <div className="nums">
        <p className="big">
          <b>{g.adj.toFixed(1)}</b>
          <span>adj pts</span>
        </p>
        <p className={kind === "dud" ? "small down" : "small"}>
          {g.delta == null ? "first game" : `${g.delta > 0 ? "+" : ""}${g.delta.toFixed(1)} vs avg (${g.baseline.toFixed(1)})`}
        </p>
        {kind === "stud" && g.certified && (
          <StudSticker size="sm" title={`Certified Stud: ${config.certifiedStud.gamePoints}+ point game`} />
        )}
        {kind === "dud" && <DudSticker size="sm" title="Certified Dud: a top-10 dud of the week" />}
      </div>
    </li>
  );
}

export default function StudsDuds({ rows, config, season, week, throughWeek, playedWeeks, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const filters = useFilters(rows);
  const { studs, duds, played } = useMemo(
    () => studsAndDuds(filters.filtered, week, config, scoring),
    [filters.filtered, week, config, scoring]
  );

  return (
    <main>
      <Masthead view="studs" season={season}>
        <p className="lede">
          Week {week}: the {config.studsDuds.count} best games and the {config.studsDuds.count} biggest letdowns.
        </p>
      </Masthead>

      <nav className="weeks" aria-label="Choose week">
        {Array.from({ length: throughWeek }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={`/studs?week=${n}`}
            aria-current={n === week ? "page" : undefined}
            className={playedWeeks.includes(n) ? undefined : "future"}
          >
            {n}
          </Link>
        ))}
      </nav>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />
      <p className="legend">
        Studs: top RPI-adjusted fantasy points this week. Duds: the biggest drops below a player's own
        average in his other games (players averaging {config.studsDuds.minBaseline}+ points).
      </p>
      <ErrorNote errors={errors} />

      {played === 0 ? (
        <p className="empty">No games played yet this week. Pick an earlier week.</p>
      ) : (
        <div className="two-col">
          <section aria-labelledby="studs-h">
            <h2 id="studs-h" className="col-head">Studs</h2>
            <ol className="board">
              {studs.map((g, i) => (
                <GameRow key={`${g.espnId ?? g.name}-s`} g={g} i={i} kind="stud" config={config} />
              ))}
            </ol>
          </section>
          <section aria-labelledby="duds-h">
            <h2 id="duds-h" className="col-head dud">Duds</h2>
            <ol className="board">
              {duds.map((g, i) => (
                <GameRow key={`${g.espnId ?? g.name}-d`} g={g} i={i} kind="dud" config={config} />
              ))}
              {duds.length === 0 && <li className="empty">Nobody fell off this week (or there aren't other games to compare yet).</li>}
            </ol>
          </section>
        </div>
      )}

      <Footer updatedAt={updatedAt} note="Adjusted with this season's RPI." />
    </main>
  );
}
