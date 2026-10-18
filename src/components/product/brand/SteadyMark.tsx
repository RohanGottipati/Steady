import React from "react";

/** Steady logomark — scalpel line-art with surgical-blue grip bands. */
export function SteadyMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="#e3f0fb"
        stroke="currentColor"
        strokeWidth="3"
      />
      <g transform="rotate(35 32 32)">
        <rect
          x="26"
          y="8"
          width="12"
          height="28"
          rx="6"
          fill="#ffffff"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <rect x="27.5" y="17" width="9" height="3.5" fill="#62a9e6" />
        <rect x="27.5" y="24" width="9" height="3.5" fill="#62a9e6" />
        <path
          d="M27 36 L27 52 Q30 58 37 47 L37 36 Z"
          fill="#f2f8fd"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
