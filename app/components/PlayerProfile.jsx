"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { COMPONENTS, certifiedDudKeys, gameKey, rankProspects, slugify } from "../../lib/ranking";
import { summarize } from "../../lib/scoring";
import { DudSticker, ErrorNote, Footer, Masthead, StudSticker, useScoring } from "./shared";
import WeeklyChart from "./WeeklyChart";

const num = (x, d = 1) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(d));
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);

// Position metrics shown in the breakdown (label, value).
function positionMetrics(p) {
  const m = p.metrics;
  if (p.pos === "QB") {
    return [
      ["Completion %", pct(m.cmpPct)],
      ["Yards / attempt", num(m.ypa)],
      ["Adj. yards / attempt", num(m.aya)],
      ["TD:INT", m.tdInt ?? "–"],
      ["Rushing share of points", pct(m.rushShareOfPoints)],
      ["Archetype", m.archetype ?? "–"],
    ];
  }
  if (p.pos === "RB") {
    return [
      ["Scrimmage yds / team play", num(m.scrimmagePerTeamPlay, 2)],
      ["Yards / carry", num(m.ypc)],
      ["Share of team rushing yds", pct(m.rushShare)],
      ["Share of team receiving yds", pct(m.recShare)],
    ];
  }
  return [
    ["Rec yds / team pass att (YPTPA)", num(m.yptpa, 2)],
    ["Weighted dominator", pct(m.weightedDominator)],
    ["Share of team rec yds", pct(m.recYdsShare)],
    ["Share of team rec TDs", pct(m.recTdShare)],
    ["Breakout (20%+ dominator)", m.breakout.flag ? `Yes${m.breakout.age ? `, at ${m.breakout.age}` : ""}` : "Not yet"],
  ];
}

// How each component's raw value is shown.
function componentValue(p, key, config) {
  const v = p.values[key];
  if (v == null) return "No data";
  if (key === "draftCapital") return `Board #${v}`;
  if (key === "age") return `${num(v)} yrs`;
  if (key === "share") return pct(v);
  if (key === "priorProduction") return `${num(v)} PPG (${p.metrics.career.priorYear})`;
  if (key === "breakout") return `Season ${v} (${p.metrics.career.breakout.year})`;
  if (key === "teamNormalized") return `${num(v, 2)} ${config.benchmarks[p.pos].teamNormalized.label.toLowerCase()}`;
  return `${num(v)} PPG`;
}

// Chart metric options per position.
function chartOptions(pos) {
  const pts = { key: "adj", label: "RPI-adjusted fantasy points", short: "Fantasy pts", format: (v) => v.toFixed(1) };
  if (pos === "QB") return [pts, { key: "aya", label: "Adj. yards per attempt", short: "AY/A", format: (v) => v.toFixed(1) }];
  if (pos === "RB") return [pts, { key: "scrimmagePerTeamPlay", label: "Scrimmage yards per team play", short: "Scrim yds/play", format: (v) => v.toFixed(2) }];
  return [pts, { key: "yptpa", label: "Receiving yards per team pass attempt", short: "YPTPA", format: (v) => v.toFixed(2) }];
}

export default function PlayerProfile({ rows, slug, config, season, errors, updatedAt }) {
  const [scoring] = useScoring();
  // Rank within the player's own draft class, matching the Rankings tab.
  const nflYear = rows.find((r) => slugify(r.name) === slug)?.nflYear;
  const ranked = useMemo(
    () => rankProspects(rows.filter((r) => r.nflYear === nflYear), config, scoring),
    [rows, config, scoring, nflYear]
  );
  const p = ranked.find((r) => r.slug === slug);
  const dudKeys = useMemo(
    () => certifiedDudKeys(rows.filter((r) => r.nflYear === nflYear), config, scoring),
    [rows, config, scoring, nflYear]
  );
  const options = chartOptions(p?.pos);
  const [chartKey, setChartKey] = useState(options[0].key);
  if (!p) return null;

  const m = p.metrics;
  const games = m.gamesDetail;
  const chart = options.find((o) => o.key === chartKey) ?? options[0];
  const weights = config.weights[p.pos];
  const extras = Object.entries(p.extras ?? {});

  return (
    <main>
      <Masthead view="player" season={season} />
      <p className="back">
        <Link href="/">← Rankings</Link>
      </p>

      <section className="profile-head">
        <div>
          <p className="who-name">
            <span className="pos">{p.posRank}</span>
            <b className="profile-name">{p.name}</b>
          </p>
          <p className="sub">
            {p.team} · {p.nflYear} class
            {m.age != null && ` · ${num(m.age)} on Sept 1`}
            {p.bigBoardRank && ` · Big board #${p.bigBoardRank}`}
          </p>
          {p.flags.length > 0 && (
            <ul className="markers">
              {p.flags.map((f) => (
                <li key={f.text} className={`marker ${f.kind}`}>{f.text}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="nums">
          <p className="big">
            <b>{p.score.toFixed(1)}</b>
            <span>score · #{p.overallRank} in {p.nflYear} class</span>
          </p>
          <p className="tier">{p.tier}</p>
          {p.certified && <StudSticker />}
        </div>
      </section>
      <ErrorNote errors={errors} />

      <section className="panel">
        <h2>Season</h2>
        <p className="line">
          <b>{m.games}</b> GP · <b>{num(m.ppg)}</b> PPG · <b>{num(m.adjPpg)}</b> RPI-adjusted PPG
        </p>
        <p className="line muted">{summarize(m.totals, p.pos) || "No stats yet"}</p>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Split</th><th className="num">Games</th><th className="num">PPG</th><th className="num">Adj PPG</th></tr>
          </thead>
          <tbody>
            <tr><td>vs Power 4</td><td className="num">{m.splits.power4.games}</td><td className="num">{num(m.splits.power4.ppg)}</td><td className="num">{num(m.splits.power4.adjPpg)}</td></tr>
            <tr><td>vs everyone else</td><td className="num">{m.splits.other.games}</td><td className="num">{num(m.splits.other.ppg)}</td><td className="num">{num(m.splits.other.adjPpg)}</td></tr>
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel">
        <h2>Career</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Season</th><th>Team</th><th className="num">GP</th><th>Stats</th><th className="num">PPG</th>
                {p.pos !== "QB" && <th className="num">Mkt share</th>}
              </tr>
            </thead>
            <tbody>
              {m.career.seasons.map((s) => (
                <tr key={s.year}>
                  <td>
                    {s.year}
                    {s.current && " (so far)"}
                    {m.career.breakout?.year === s.year && <span className="rpi boosted"> breakout</span>}
                  </td>
                  <td>{s.team ?? "–"}</td>
                  <td className="num">{s.games}</td>
                  <td className="muted">{summarize(s.totals, p.pos) || "–"}</td>
                  <td className="num">{num(s.ppg)}</td>
                  {p.pos !== "QB" && <td className="num">{pct(s.dominator)}</td>}
                </tr>
              ))}
              {m.career.seasons.length === 0 && (
                <tr><td colSpan={6} className="empty">No college stats on file yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Score breakdown</h2>
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Value</th>
              <th className="num">Score</th>
              <th className="num" title={`Percentile among the ${p.pos}s on the watchlist`}>{p.pos} pctl</th>
              <th className="num">Weight</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENTS.map(({ key, label }) => (
              <tr key={key} className={p.components[key] == null ? "missing" : undefined}>
                <td>{label}</td>
                <td>{componentValue(p, key, config)}</td>
                <td className="num">{p.components[key] ?? "–"}</td>
                <td className="num">{p.percentiles[key] ?? "–"}</td>
                <td className="num">{p.components[key] == null ? "dropped" : weights[key] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <dl className="metric-list">
          {positionMetrics(p).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
          {extras.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{chart.label} by week</h2>
          <div className="chips" role="group" aria-label="Chart metric">
            {options.map((o) => (
              <button key={o.key} type="button" aria-pressed={chartKey === o.key} onClick={() => setChartKey(o.key)}>
                {o.short}
              </button>
            ))}
          </div>
        </div>
        <WeeklyChart
          label={chart.label}
          format={chart.format}
          points={games.map((g) => ({ week: g.week, opponent: g.opponent, value: g[chart.key] }))}
        />
      </section>

      <section className="panel">
        <h2>Game log</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Wk</th><th>Opponent</th><th>Stats</th><th className="num">Pts</th><th className="num">Adj</th><th></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.week}>
                  <td>{g.week}</td>
                  <td>
                    {g.opponent}{" "}
                    <span className={g.mult > 1 ? "rpi boosted" : "rpi"}>{g.oppRank ? `RPI #${g.oppRank}` : "FCS"}</span>
                    {g.power4 && <span className="rpi"> P4</span>}
                  </td>
                  <td className="muted">{summarize(g.totals, p.pos) || "–"}</td>
                  <td className="num">{g.raw.toFixed(1)}</td>
                  <td className="num"><b>{g.adj.toFixed(1)}</b></td>
                  <td>
                    {g.raw > config.certifiedStud.gamePoints && <StudSticker size="sm" />}
                    {dudKeys.has(gameKey({ ...p, week: g.week })) && <DudSticker size="sm" />}
                  </td>
                </tr>
              ))}
              {games.length === 0 && (
                <tr><td colSpan={6} className="empty">No games yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Footer updatedAt={updatedAt} note="" />
    </main>
  );
}
