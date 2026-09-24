"use client";

import Link from "next/link";
import { fantasyPoints } from "../../lib/scoring";
import { Controls, ErrorNote, Footer, Masthead, useFilters, useScoring } from "./shared";

const STATUS_TEXT = {
  played: null,
  live: "In progress",
  upcoming: "Not started",
  "no stats": "No recorded stats",
  "no game": "No game this week",
};

// Players with points first, then games still to come, then everyone else.
const STATUS_ORDER = { played: 0, live: 0, upcoming: 1, "no stats": 2, "no game": 3 };

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function PlayerRow({ row, points }) {
  const note = STATUS_TEXT[row.status];
  const scored = row.status === "played" || row.status === "live";
  return (
    <article className={`row status-${row.status.replace(" ", "-")}`}>
      <div className="row-head">
        <span className="pos">{row.pos}</span>
        <div>
          <h2>{row.name}</h2>
          <p className="sub">
            {row.team} · {row.nflYear} class
          </p>
        </div>
      </div>

      <div className="row-body">
        {row.score && (
          <p className="game">
            {row.score}
            <time className="date" suppressHydrationWarning>
              {" "}
              {formatDate(row.date)}
            </time>
          </p>
        )}

        {note && <p className="note">{note}</p>}

        {row.stats.length > 0 && (
          <dl className="stats">
            {row.stats.map((line) => (
              <div key={line.category} className="stat-line">
                <dt>{line.category}</dt>
                <dd>
                  {line.stats.map((s) => (
                    <span key={s.label} className="stat">
                      <b>{s.value}</b> {s.label}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {row.eventId && (
          <p className="links">
            <a href={row.filmUrl} target="_blank" rel="noreferrer">
              Find highlights
            </a>
            <a href={row.boxScoreUrl} target="_blank" rel="noreferrer">
              ESPN box score
            </a>
          </p>
        )}
      </div>

      <div className="fpts" aria-label={scored ? `${points} fantasy points` : undefined}>
        {scored ? (
          <>
            <b>{points.toFixed(1)}</b>
            <span>pts</span>
          </>
        ) : (
          <span className="dash">–</span>
        )}
      </div>
    </article>
  );
}

export default function Tracker({ rows, week, season, currentWeek, weeks, errors, updatedAt }) {
  const [scoring, setScoring] = useScoring();
  const filters = useFilters(rows);

  const shown = filters.filtered
    .map((row) => ({ row, points: fantasyPoints(row.totals, scoring) }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status] ||
        b.points - a.points ||
        a.row.name.localeCompare(b.row.name)
    );

  const played = rows.filter((r) => r.status === "played" || r.status === "live").length;

  return (
    <main>
      <Masthead view="week" season={season}>
        <p className="lede">
          Week {week}: {played} of {rows.length} prospects have box score stats.
        </p>
      </Masthead>

      <nav className="weeks" aria-label="Choose week">
        {Array.from({ length: weeks }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={`/week?week=${n}`}
            aria-current={n === week ? "page" : undefined}
            className={n > currentWeek ? "future" : undefined}
          >
            {n}
          </Link>
        ))}
      </nav>

      <Controls filters={filters} scoring={scoring} setScoring={setScoring} />
      <ErrorNote errors={errors} />

      <section className="list">
        {shown.map(({ row, points }) => (
          <PlayerRow key={row.espnId ?? row.name} row={row} points={points} />
        ))}
        {shown.length === 0 && (
          <p className="empty">No prospects match. Clear the search or pick another filter.</p>
        )}
      </section>

      <Footer updatedAt={updatedAt} note="The current week refreshes every 10 minutes." />
    </main>
  );
}
