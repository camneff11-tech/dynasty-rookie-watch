"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { certifiedDudKeys, gameKey, gamePerformance, slugify } from "../../lib/ranking";
import { summarize } from "../../lib/scoring";
import { Controls, DudSticker, ErrorNote, Footer, Masthead, StudSticker, useFilters, useScoring } from "./shared";

const SEASON_LIMIT = 50;
const VIEWS = { points: "Points", usage: "Usage" };
const WEIGHTINGS = { rpi: "RPI-weighted", raw: "Raw" };

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);

function Toggle({ label, options, value, onChange }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {Object.entries(options).map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// "9 of 22 team catches · 196 of 382 team rec yds"
function usageLine(g) {
  const t = g.totals;
  const team = g.teamTotals;
  if (!team) return "Team totals unavailable";
  if (g.pos === "QB") {
    return `${t.rushAtt} of ${team.rushAtt} team carries · ${t.rushYds} of ${team.rushYds} team rush yds · ${t.passAtt} pass att`;
  }
  if (g.pos === "RB") {
    return `${t.rushAtt + t.rec} of ${team.rushAtt + team.rec} team touches · ${t.rushYds + t.recYds} of ${team.rushYds + team.recYds} team scrimmage yds · ${t.rushTD + t.recTD} of ${team.rushTD + team.recTD} TDs`;
  }
  return `${t.rec} of ${team.rec} team catches · ${t.recYds} of ${team.recYds} team rec yds · ${t.recTD} of ${team.recTD} rec TDs`;
}

export default function Performances({ games, config, season, week, throughWeek, playedWeeks, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const [view, setView] = useState("points");
  const [weighting, setWeighting] = useState("rpi");
  const inView = useMemo(
    () => (week === "all" ? games : games.filter((g) => g.week === week)),
    [games, week]
  );
  const filters = useFilters(inView);
  // Regroup games by player to find each week's Certified Duds (see lib/ranking.js).
  const dudKeys = useMemo(() => {
    const byPlayer = new Map();
    for (const g of games) {
      const k = g.espnId ?? g.name;
      if (!byPlayer.has(k)) byPlayer.set(k, { ...g, weeks: [] });
      byPlayer.get(k).weeks.push(g);
    }
    return certifiedDudKeys([...byPlayer.values()], config, scoring);
  }, [games, config, scoring]);
  const weighted = weighting === "rpi";

  const ranked = filters.filtered
    .map((g) => gamePerformance(g, config, scoring))
    .map((g) => ({ ...g, pts: weighted ? g.adj : g.raw }))
    .sort((a, b) =>
      view === "usage"
        ? (b.usage.dominator ?? -1) - (a.usage.dominator ?? -1) || b.pts - a.pts
        : b.pts - a.pts || a.name.localeCompare(b.name)
    );
  const shown = week === "all" ? ranked.slice(0, SEASON_LIMIT) : ranked;

  const what = view === "usage" ? "share of their team's offense" : weighted ? "RPI-weighted points" : "raw fantasy points";

  return (
    <main>
      <Masthead view="performances" season={season}>
        <p className="lede">
          {week === "all"
            ? `Best single games of the season through week ${throughWeek}, by ${what}.`
            : `Week ${week}'s best games, by ${what}.`}
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

      <div className="view-toggles">
        <Toggle label="Rank by" options={VIEWS} value={view} onChange={setView} />
        {view === "points" && (
          <Toggle label="Yards and TDs" options={WEIGHTINGS} value={weighting} onChange={setWeighting} />
        )}
      </div>
      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />
      <p className="legend">
        {view === "usage"
          ? "Usage = share of the team's production in the player's role (dominator rating). Shares aren't RPI-weighted. ESPN doesn't publish targets, so catches stand in."
          : weighted
            ? `${config.opponentTiers
                .map((t, i) => `RPI ${i === 0 ? 1 : config.opponentTiers[i - 1].upToRank + 1}–${t.upToRank}: ×${t.multiplier}`)
                .join(" · ")} · everyone else ×1 (yards and TDs)`
            : "Raw box score numbers, no opponent adjustment."}
      </p>
      <ErrorNote errors={errors} />

      <ol className="board">
        {shown.map((g, i) => (
          <li key={`${g.espnId ?? g.name}-${g.week}`}>
            <span className="rank">{i + 1}</span>
            <div className="who">
              <p className="who-name">
                <span className="pos">{g.pos}</span>
                <Link href={`/player/${slugify(g.name)}`}>{g.name}</Link>
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
              <p className="line muted">
                {view === "usage"
                  ? usageLine(g)
                  : summarize(weighted ? g.adjTotals : g.totals, g.pos) || "No offensive stats"}
                {view === "points" && weighted && g.mult > 1 && <span className="rpi boosted"> ×{g.mult}</span>}
              </p>
            </div>
            <div className="nums">
              {view === "usage" ? (
                <>
                  <p className="big">
                    <b>{pct(g.usage.dominator)}</b>
                    <span>{g.pos === "QB" ? "rush share" : "dominator"}</span>
                  </p>
                  <p className="small">
                    {pct(g.usage.opportunity)} {g.usage.opportunityLabel}
                  </p>
                </>
              ) : (
                <>
                  <p className="big">
                    <b>{g.pts.toFixed(1)}</b>
                    <span>{weighted ? "adj pts" : "pts"}</span>
                  </p>
                  <p className="small">
                    {weighted
                      ? g.mult > 1
                        ? `${g.raw.toFixed(1)} raw ×${g.mult}`
                        : `${g.raw.toFixed(1)} raw`
                      : `${g.adj.toFixed(1)} RPI-weighted`}
                  </p>
                </>
              )}
              {g.raw > config.certifiedStud.gamePoints && (
                <StudSticker size="sm" title={`Certified Stud: ${config.certifiedStud.gamePoints}+ point game`} />
              )}
              {dudKeys.has(gameKey(g)) && <DudSticker size="sm" title="Certified Dud: a top-10 dud of the week" />}
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
