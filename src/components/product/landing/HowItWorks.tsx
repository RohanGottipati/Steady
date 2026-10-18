import React from "react";
import { Eye, Hand, Repeat } from "lucide-react";
import { BracketLabel } from "../brand/BracketLabel";
import { HOW_IT_WORKS } from "../data/landing";

const ICONS = { watch: Eye, mirror: Hand, review: Repeat } as const;

export function HowItWorks() {
  return (
    <section className="w-full bg-background">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <BracketLabel>How a session runs</BracketLabel>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps from webcam to deliberate practice.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Learn with a continuous ghost, practice with it on demand, or switch
            to assessment for a clean, unassisted score.
          </p>
        </div>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => {
            const Icon = ICONS[item.id as keyof typeof ICONS];
            return (
              <li
                key={item.id}
                className="relative rounded-2xl border-[1.5px] border-border bg-card p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-[1.5px] border-border bg-secondary">
                    <Icon
                      className="h-7 w-7 text-foreground"
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </span>
                  <span className="font-mono text-3xl font-semibold text-scrub-200">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <div className="mt-6 flex gap-1" aria-hidden>
                  <span className="h-1.5 w-8 rounded-full bg-scrub-400" />
                  <span className="h-1.5 w-3 rounded-full bg-scrub-200" />
                  <span className="h-1.5 w-3 rounded-full bg-scrub-200" />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
