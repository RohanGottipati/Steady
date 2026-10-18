import React from "react";
import { SteadyMark } from "../brand/SteadyMark";
import { BracketLabel } from "../brand/BracketLabel";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <SteadyMark className="h-7 w-7 text-ink" />
          <div>
            <p className="text-sm font-semibold">Steady</p>
            <p className="text-xs text-muted-foreground">
              Hardware-free surgical motion trainer with webcam coaching and 3D
              replay.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 md:items-end">
          <BracketLabel>Anonymous · device-scoped · no account</BracketLabel>
          <p className="text-xs text-muted-foreground">
            Canonical synthetic training guides; optional JIGSAWS
            demonstrations. For simulation practice only.
          </p>
        </div>
      </div>
    </footer>
  );
}
