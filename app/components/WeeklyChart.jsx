"use client";

import { useRef, useState } from "react";

// Single-series weekly line chart in inline SVG (no chart library). One series, so no
// legend: the heading names what's plotted. Hover or focus snaps to the nearest week.
const W = 640;
const H = 240;
const PAD = { top: 18, right: 44, bottom: 30, left: 40 };

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => (s * pow * 4) >= v) * pow;
  return Math.ceil(v / step) * step;
}

export default function WeeklyChart({ points, format, label }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const data = points.filter((p) => p.value != null && Number.isFinite(p.value));
  if (data.length === 0) return <p className="empty">No games with this stat yet.</p>;

  const max = niceMax(Math.max(...data.map((p) => p.value)));
  const min = Math.min(0, ...data.map((p) => p.value));
  const weeks = data.map((p) => p.week);
  const x0 = Math.min(...weeks);
  const x1 = Math.max(...weeks);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (wk) => PAD.left + (x1 === x0 ? innerW / 2 : ((wk - x0) / (x1 - x0)) * innerW);
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const path = data.map((p, i) => `${i ? "L" : "M"}${x(p.week).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const nearest = (clientX) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const sx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    data.forEach((p, i) => {
      if (Math.abs(x(p.week) - sx) < Math.abs(x(data[best].week) - sx)) best = i;
    });
    return best;
  };

  const h = hover == null ? null : data[hover];
  const last = data.at(-1);

  return (
    <figure className="chart">
      <div className="chart-box">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label} by week`}
          tabIndex={0}
          onPointerMove={(e) => setHover(nearest(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(data.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? data.length) - 1));
            if (e.key === "ArrowRight") setHover((i) => Math.min(data.length - 1, (i ?? -1) + 1));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((p) => (
            <text key={p.week} className="axis" x={x(p.week)} y={H - 8} textAnchor="middle">
              W{p.week}
            </text>
          ))}
          <path d={`${path} L${x(last.week)},${y(min)} L${x(data[0].week)},${y(min)} Z`} className="area" />
          <path d={path} className="series-line" />
          {h && <line className="crosshair" x1={x(h.week)} x2={x(h.week)} y1={PAD.top} y2={PAD.top + innerH} />}
          {data.map((p, i) => (
            <circle key={p.week} className="dot" cx={x(p.week)} cy={y(p.value)} r={hover === i ? 6 : 4} />
          ))}
          <text className="end-label" x={x(last.week) + 10} y={y(last.value)} dy="0.32em">
            {format(last.value)}
          </text>
        </svg>
        {h && (
          <div
            className="chart-tip"
            style={{ left: `${(x(h.week) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%` }}
          >
            <b>{format(h.value)}</b>
            <span>
              Week {h.week} vs {h.opponent}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
