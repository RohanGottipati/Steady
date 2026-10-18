"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep the SAME video node painted while the user scrolls to the instruments.
 * Browsers may throttle offscreen video callbacks, interrupting steady capture
 * and grip recovery. This changes only preview layout, never camera ownership. */
export function CameraPreviewFrame({ active, children }: { active: boolean; children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  useEffect(() => {
    if (!active || !anchor.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting || entry.intersectionRatio < 0.2), { threshold: [0, 0.2] });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [active]);
  const compact = active && floating;
  return <div ref={anchor} className="aspect-video w-full" data-testid="camera-preview-anchor">
    <div data-testid="camera-preview-frame" data-floating={compact}
      className={compact ? "pointer-events-none fixed bottom-4 left-4 z-40 w-40 overflow-hidden rounded-lg bg-zinc-950 shadow-lg ring-1 ring-white/40" : "relative overflow-hidden rounded-lg bg-zinc-950"}>
      {children}
      {compact && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">Live webcam</span>}
    </div>
  </div>;
}
