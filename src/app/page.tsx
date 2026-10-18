import { SiteShell } from "@/components/product/layout/SiteShell";
import { LandingHero } from "@/components/product/landing/LandingHero";
import { HowItWorks } from "@/components/product/landing/HowItWorks";
import { ScoringSection } from "@/components/product/landing/ScoringSection";
import { SkillCard } from "@/components/product/library/SkillCard";
import { skills } from "@/components/product/data/skills";
import { BracketLabel } from "@/components/product/brand/BracketLabel";
export default function Home() {
  return (
    <SiteShell dark>
      <main id="main-content" className="flex-1">
        <LandingHero />
        <HowItWorks />
        <ScoringSection />
        <section className="mx-auto max-w-7xl px-6 py-20">
          <BracketLabel>Skills library</BracketLabel>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Start with the fundamentals.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} compact />
            ))}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
