import React from "react";

/** Minimal score trend line with a highlighted latest point. */
export function Sparkline({
  values,
  className = "h-14 w-full",
}: {
  values: number[];
  className?: string;
}) {
  if (values.length === 0) return null;
  const w = 200;
  const h = 56;
  const min = Math.min(...values) - 6;
  const max = Math.max(...values) + 6;
  const pts = values.map((v, i) => [
    values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4,
    h - ((v - min) / (max - min || 1)) * (h - 10) - 5,
  ]);
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Score trend: ${values.join(", ")}`}
    >
      <line
        x1="0"
        x2={w}
        y1={h - 1}
        y2={h - 1}
        stroke="#d5e0e8"
        strokeWidth="1"
      />
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="#3b8ad8"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === pts.length - 1 ? 4 : 2.5}
          fill={i === pts.length - 1 ? "#0a141c" : "#97c8f0"}
        />
      ))}
      <circle
        cx={last[0]}
        cy={last[1]}
        r="7"
        fill="none"
        stroke="#0a141c"
        strokeOpacity="0.2"
      />
    </svg>
  );
}
