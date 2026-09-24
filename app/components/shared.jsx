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
        2027 &amp; 2028 classes <span className="season">· {season} season</span>
      </p>
      {children}
      <nav className="tabs" aria-label="Choose view">
        <Link href="/" aria-current={view === "rankings" ? "page" : undefined}>
          Rankings
        </Link>
        <Link href="/performances" aria-current={view === "performances" ? "page" : undefined}>
          Top performances
        </Link>
        <Link href="/studs" aria-current={view === "studs" ? "page" : undefined}>
          Studs &amp; Duds
        </Link>
        <Link href="/week" aria-current={view === "week" ? "page" : undefined}>
          Box scores
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

export function Controls({ filters, scoring, setScoring, showPositions = true }) {
  const { classes, pos, setPos, draftClass, setDraftClass, query, setQuery } = filters;
  return (
    <div className="controls">
      <div className="control-row">
        {showPositions && (
          <Chips label="Filter by position" options={POSITIONS} value={pos} onChange={setPos} />
        )}
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

// Stickers: "Certified Stud" (Tier 1 prospects, 30+ point games) and "Certified Dud"
// (the week's top-10 duds).
function Sticker({ kind, size, title }) {
  const stud = kind === "stud";
  const label = stud ? "Certified Stud" : "Certified Dud";
  return (
    <span className={`stud-sticker ${kind} ${size}`} title={title ?? label}>
      <img
        src={stud ? "/certified-stud.png" : "/certified-dud.png"}
        alt=""
        width={size === "sm" ? 36 : 56}
        height={size === "sm" ? 36 : 56}
      />
      <span>{label}</span>
    </span>
  );
}

export function StudSticker({ size = "md", title }) {
  return <Sticker kind="stud" size={size} title={title} />;
}

export function DudSticker({ size = "md", title }) {
  return <Sticker kind="dud" size={size} title={title} />;
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
