import Link from "next/link";
import { SiteShell } from "@/components/product/layout/SiteShell";
import { notFound } from "next/navigation";
import { TrainingSession } from "@/components/training/training-session";
import {
  getCatalogEntry,
  getSkillBlueprint,
  getSkillCatalog,
  getSkillDefinition,
} from "@/lib/skills/catalog";

function sentenceCase(words: string): string {
  const lower = words.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// camelCase metric id → human-readable label, e.g. "bimanualCoordination" →
// "Bimanual coordination". Splits only at lower→upper boundaries so runs of
// capitals stay intact.
function metricLabel(id: string): string {
  return sentenceCase(id.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

// kebab-case coaching rule id → human-readable label, e.g.
// "square-knot-seating" → "Square knot seating".
function ruleLabel(id: string): string {
  return sentenceCase(id.replace(/-/g, " "));
}

// Prerender a static page per known skill (data-driven). Unknown ids fall back
// to on-demand rendering and 404 via notFound().
export function generateStaticParams() {
  return getSkillCatalog().map((skill) => ({ skillId: skill.id }));
}

export default async function TrainPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;
  const skill = getCatalogEntry(skillId);

  if (!skill) notFound();

  const definition = skill.status === "available" ? getSkillDefinition(skillId) : undefined;
  const blueprint = definition ? undefined : getSkillBlueprint(skillId);

  // Metric weights sorted heaviest-first so the preview leads with what this
  // skill will emphasise.
  const weightedMetrics = blueprint
    ? Object.entries(blueprint.metricWeights).sort((a, b) => b[1] - a[1])
    : [];

  if (definition) return <main id="main-content"><TrainingSession skill={skill} definition={definition} /></main>;

  return (
    <SiteShell><main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Link
        href="/library"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Library
      </Link>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {skill.title}
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
        {skill.description}
      </p>

      {skill.status === "coming-soon" || !definition ? (
        <>
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">This skill is coming soon.</p>
            <p className="mt-1 text-sm">
              Its trainer scene is not available yet ({skill.sourceLabel}). Try Needle
              Passing or Peg Transfer to use the trainer.
            </p>
            <Link
              href="/library"
              className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
            >
              Back to library
            </Link>
          </div>

          {blueprint ? (
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <section>
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  What you&apos;ll practice
                </h2>
                <ol className="mt-3 space-y-3">
                  {blueprint.segments.map((segment, index) => (
                    <li key={segment.id} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {index + 1}
                      </span>
                      <span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {segment.title}
                        </span>
                        <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                          {segment.instructions}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  How it will be scored
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {weightedMetrics.map(([metricId, weight]) => (
                    <li
                      key={metricId}
                      className={
                        weight > 1
                          ? "inline-flex items-center rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                          : "inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }
                    >
                      {metricLabel(metricId)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  Highlighted areas carry extra weight in this skill&apos;s score.
                </p>

                <h3 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Coaching focus
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {blueprint.coachingRules.map((rule) => (
                    <li key={rule} className="flex gap-2">
                      <span aria-hidden className="text-zinc-400 dark:text-zinc-600">
                        •
                      </span>
                      {ruleLabel(rule)}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                  {blueprint.attribution}
                </p>
              </section>
            </div>
          ) : null}
        </>
      ) : (
        <TrainingSession skill={skill} definition={definition} />
      )}
    </main></SiteShell>
  );
}
