"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DEFAULT_SCORING, SCORING } from "../../lib/scoring";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"];
const SCORING_KEY = "guisto-rookie-scoring";

// Scoring choice is remembered per browser; the page renders fine without storage.
export function useScoring() {
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCORING_KEY);
      if (saved && SCORING[saved]) setScoring(saved);
    } catch {}
  }, []);
  const choose = (value) => {
    setScoring(value);
    try {
      localStorage.setItem(SCORING_KEY, value);
    } catch {}
  };
  return [scoring, choose];
}

// Position / draft class / search filters shared by the week and season views.
export function useFilters(rows) {
  const classes = useMemo(
    () => [...new Set(rows.map((r) => r.nflYear))].sort((a, b) => a - b),
    [rows]
  );
  const [pos, setPos] = useState("All");
  const [draftClass, setDraftClass] = useState(classes[0] ?? "All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => pos === "All" || r.pos === pos)
      .filter((r) => draftClass === "All" || r.nflYear === draftClass)
      .filter((r) => !q || `${r.name} ${r.team}`.toLowerCase().includes(q));
  }, [rows, pos, draftClass, query]);

  return { filtered, classes, pos, setPos, draftClass, setDraftClass, query, setQuery };
}

export function Masthead({ view, season, children }) {
  return (
    <header className="masthead">
      <p className="kicker">League of Guisto</p>
      <h1>Dynasty Rookie Review</h1>
      <p className="season-line">
        2027 class <span className="season">· {season} season</span>
      </p>
      {children}
      <nav className="tabs" aria-label="Choose view">
        <Link href="/rankings" aria-current={view === "rankings" ? "page" : undefined}>
          Rankings
        </Link>
        <Link href="/" aria-current={view === "week" ? "page" : undefined}>
          Week
        </Link>
        <Link href="/season" aria-current={view === "season" ? "page" : undefined}>
          Season
        </Link>
      </nav>
    </header>
  );
}

function Chips({ label, options, value, onChange, format = (o) => o }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export function Controls({ filters, scoring, setScoring }) {
  const { classes, pos, setPos, draftClass, setDraftClass, query, setQuery } = filters;
  return (
    <div className="controls">
      <div className="control-row">
        <Chips label="Filter by position" options={POSITIONS} value={pos} onChange={setPos} />
        {classes.length > 1 && (
          <Chips
            label="Filter by draft class"
            options={[...classes, "All"]}
            value={draftClass}
            onChange={setDraftClass}
            format={(o) => (o === "All" ? "All classes" : `${o} class`)}
          />
        )}
      </div>
      <div className="control-row">
        <Chips
          label="Scoring"
          options={Object.keys(SCORING)}
          value={scoring}
          onChange={setScoring}
          format={(o) => SCORING[o].label}
        />
        <input
          type="search"
          placeholder="Search player or school"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search player or school"
        />
      </div>
    </div>
  );
}

export function ErrorNote({ errors }) {
  if (errors.length === 0) return null;
  return (
    <p className="error">
      Some ESPN data didn’t load ({errors.length} request{errors.length > 1 ? "s" : ""} failed).
      Refresh in a few minutes.
    </p>
  );
}

export function Footer({ updatedAt, note }) {
  return (
    <footer>
      {note} Stats from ESPN’s public API. Fantasy points: 4 pt pass TD, 6 pt rush/rec TD,
      1 pt per 25 pass yds or 10 rush/rec yds, −2 per INT or fumble lost. Last built{" "}
      <time suppressHydrationWarning>{new Date(updatedAt).toLocaleString("en-US")}</time>.
    </footer>
  );
}
