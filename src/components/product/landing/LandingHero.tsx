"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronsDown } from "lucide-react";
import { Button } from "../Button";
import { BracketLabel } from "../brand/BracketLabel";
import { OperatingRoomPreview } from "@/components/scene/room-preview";

import { HERO_STATS } from "../data/landing";

const CORNERS = [
  "left-3 top-3 border-l-2 border-t-2",
  "right-3 top-3 border-r-2 border-t-2",
  "left-3 bottom-3 border-l-2 border-b-2",
  "right-3 bottom-3 border-r-2 border-b-2",
];

export function LandingHero() {
  const { push: navigate } = useRouter();
  return (
    <section className="relative w-full overflow-hidden bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-10 pt-12 lg:grid-cols-12 lg:pt-20">
        <div className="flex flex-col justify-center lg:col-span-5">
          <BracketLabel tone="dark">
            OR-03 · Surgical motion trainer
          </BracketLabel>
          <h1 className="mt-6 text-[42px] font-semibold leading-[1.02] tracking-tight sm:text-5xl lg:text-[58px]">
            Train the motion
            <br />
            before the <span className="text-scrub-300">operating room.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/65">
            Practice needle passing and peg transfer with just your laptop
            camera. Watch the expert ghost, mirror the motion, then compare your
            motion in 3D.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/train/needle-passing")}
            >
              Enter the OR
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="rounded-full text-white hover:bg-card/10 hover:text-white"
              onClick={() => navigate("/library")}
            >
              Browse skills
            </Button>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {s.value}
                </dd>
                <p className="mt-0.5 text-xs text-white/50">{s.label}</p>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-7">
          <div className="relative aspect-[16/11] overflow-hidden rounded-[24px] border border-white/10 bg-ink-800">
            <OperatingRoomPreview />

            {CORNERS.map((c) => (
              <span
                key={c}
                className={`pointer-events-none absolute h-6 w-6 border-scrub-300/80 ${c}`}
                aria-hidden
              />
            ))}
            <div className="pointer-events-none absolute left-6 top-6 flex items-center gap-2 rounded-full bg-ink/75 px-3 py-1.5 backdrop-blur">
              <span
                className="h-1.5 w-1.5 animate-blink rounded-full bg-alert"
                aria-hidden
              />
              <BracketLabel tone="dark" className="text-[9px]">
                Demonstration · surgeon view
              </BracketLabel>
            </div>
            <div className="pointer-events-none absolute bottom-6 left-6 rounded-2xl bg-ink/80 px-4 py-3 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-scrub-300">
                Segment 05 · Rotation
              </p>
              <p className="mt-1 text-sm">
                Roll your wrist through the center ring.
              </p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-4 lg:justify-end">
            <BracketLabel tone="dark">
              Camera stays off until you start
            </BracketLabel>
          </div>
        </div>
      </div>
      <div className="flex justify-center pb-6">
        <ChevronsDown
          className="h-5 w-5 animate-bounce text-white/35"
          aria-hidden
        />
      </div>
    </section>
  );
}
