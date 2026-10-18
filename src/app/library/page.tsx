import { SiteShell } from "@/components/product/layout/SiteShell";
import { SkillGrid } from "@/components/library/skill-grid";
import { getSkillCatalog } from "@/lib/skills/catalog";
import { BracketLabel } from "@/components/product/brand/BracketLabel";
import { MODE_INFO } from "@/components/product/data/skills";
import { BookOpen, ClipboardCheck, Dumbbell } from "lucide-react";
export const metadata = { title: "Surgical Skills Library — Steady" };
const icons = {
  learn: BookOpen,
  practice: Dumbbell,
  assessment: ClipboardCheck,
};
export default function LibraryPage() {
  return (
    <SiteShell>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-6 py-12"
      >
        <BracketLabel>Skills library</BracketLabel>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h1 className="text-4xl font-semibold tracking-tight">
            Surgical Skills Library
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Needle Passing and Peg Transfer are ready in the 3D operating room.
            Preview the blueprints for upcoming skills.
          </p>
        </div>
        <ul
          aria-label="Training modes"
          className="mt-8 grid gap-3 sm:grid-cols-3"
        >
          {MODE_INFO.map((mode) => {
            const Icon = icons[mode.id];
            return (
              <li
                key={mode.id}
                className="flex gap-3 rounded-2xl border bg-card p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{mode.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {mode.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-10">
          <SkillGrid skills={getSkillCatalog()} />
        </div>
      </main>
    </SiteShell>
  );
}
