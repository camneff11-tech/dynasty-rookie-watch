"use client";

import { useMemo } from "react";
import Link from "next/link";
import { COMPONENTS, rankProspects } from "../../lib/ranking";
import { Controls, ErrorNote, Footer, Masthead, useFilters, useScoring } from "./shared";

const pct = (x) => `${Math.round(x * 100)}%`;

function ComponentBars({ p, weights }) {
  return (
    <dl className="bars">
      {COMPONENTS.map(({ key, label }) => {
        const value = p.components[key];
        return (
          <div key={key} className={value == null ? "bar missing" : "bar"}>
            <dt>
              {label} <span className="wt">{weights[key]}%</span>
            </dt>
            <dd>
              <span className="track" aria-hidden="true">
                <span className="fill" style={{ width: `${value ?? 0}%` }} />
              </span>
              <b>{value ?? "–"}</b>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function GameStrip({ games }) {
  if (games.length === 0) return null;
  return (
    <p className="weekly" aria-label="Adjusted points by game">
      {games.map((g) => (
        <Link
          key={g.week}
          href={`/performances?week=${g.week}`}
          className={g.mult > 1 ? "boosted" : undefined}
          title={`Week ${g.week} vs ${g.opponent}${g.oppRank ? ` (RPI #${g.oppRank})` : " (FCS/unranked)"}: ${g.raw.toFixed(1)} raw × ${g.mult} = ${g.adj.toFixed(1)}`}
        >
          <small>
            W{g.week} {g.oppRank ? `#${g.oppRank}` : "FCS"}
          </small>
          {g.adj.toFixed(1)}
          {g.mult > 1 && <small className="mult">×{g.mult}</small>}
        </Link>
      ))}
    </p>
  );
}

function ProspectRow({ p, weights }) {
  return (
    <li className={`prospect${p.gp ? "" : " status-no-stats"}`}>
      <span className="rank">{p.overallRank}</span>
      <div className="who">
        <p className="who-name">
          <span className="pos">{p.posRank}</span>
          <b>{p.name}</b>
        </p>
        <p className="sub">
          {p.team} · {p.nflYear} class
        </p>
        <p className="line">
          <b>{p.adjPpg.toFixed(1)}</b> adj PPG <span className="muted">({p.rawPpg.toFixed(1)} raw)</span>
          {" · "}
          {p.gp} GP
          {p.efficiencyValue != null && (
            <>
              {" · "}
              {p.efficiencyValue} {p.efficiencyLabel.toLowerCase()}
            </>
          )}
          {p.usage.dominator != null && (
            <>
              {" · "}
              {pct(p.usage.dominator)} {p.usage.dominatorLabel}
            </>
          )}
          {p.vsTop.games > 0 && (
            <>
              {" · "}
              {p.vsTop.ppg.toFixed(1)} PPG in {p.vsTop.games} vs Top 40
            </>
          )}
        </p>
        {p.markers.length > 0 && (
          <ul className="markers">
            {p.markers.map((m) => (
              <li key={m.text} className={`marker ${m.kind}`}>
                {m.text}
              </li>
            ))}
          </ul>
        )}
        <GameStrip games={p.games} />
      </div>
      <div className="nums">
        <p className="big">
          <b>{p.score.toFixed(1)}</b>
          <span>score</span>
        </p>
        <p className="tier">{p.tier}</p>
      </div>
      <ComponentBars p={p} weights={weights} />
    </li>
  );
}

function Method({ config }) {
  return (
    <details className="method">
      <summary>How the Prospect Score works</summary>
      <p>
        Each prospect gets a 0–100 score from three parts, weighted by position. Size and speed
        aren't scored until combine numbers exist.
      </p>
      <ul>
        <li>
          <b>Production:</b> fantasy points per game after opponent adjustment. Against{" "}
          {config.opponentTiers
            .map((t, i) => {
              const from = i === 0 ? 1 : config.opponentTiers[i - 1].upToRank + 1;
              return `RPI ${from}–${t.upToRank} opponents, yards and TDs count ×${t.multiplier}`;
            })
            .join("; ")}
          ; everyone else ×1. RPI is recalculated from every FBS result this season.
        </li>
        <li>
          <b>Efficiency:</b> QB adjusted yards per attempt, RB yards per touch, WR/TE receiving
          yards per team pass attempt, pulled toward average until there's a real sample.
        </li>
        <li>
          <b>Market share:</b> the player's share of his team's offense ("dominator rating"):
          share of team receiving yards and TDs for WR/TE, scrimmage yards and TDs for RBs, and
          rushing yards for QBs.
        </li>
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
                <td key={c.key}>{w[c.key]}%</td>
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
  const filters = useFilters(rows);
  const { draftClass, pos, query } = filters;

  // Rank within the chosen draft class; position and search only narrow what's shown.
  const ranked = useMemo(
    () =>
      rankProspects(
        rows.filter((r) => draftClass === "All" || r.nflYear === draftClass),
        config,
        scoring
      ),
    [rows, config, scoring, draftClass]
  );
  const q = query.trim().toLowerCase();
  const shown = ranked
    .filter((p) => pos === "All" || p.pos === pos)
    .filter((p) => !q || `${p.name} ${p.team}`.toLowerCase().includes(q));

  return (
    <main>
      <Masthead view="rankings" season={season}>
        <p className="lede">
          Prospect Score through week {throughWeek}: opponent-adjusted production, efficiency and
          market share.
        </p>
      </Masthead>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />
      <Method config={config} />
      <ErrorNote errors={errors} />

      <ol className="board rankings">
        {shown.map((p) => (
          <ProspectRow key={p.espnId ?? p.name} p={p} weights={config.weights[p.pos]} />
        ))}
        {shown.length === 0 && (
          <li className="empty">No prospects match. Clear the search or pick another filter.</li>
        )}
      </ol>

      <Footer updatedAt={updatedAt} note="Rankings update as new box scores and results come in." />
    </main>
  );
}
