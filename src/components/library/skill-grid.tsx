"use client";

import { useMemo, useState } from "react";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { SkillCard } from "./skill-card";

// Client-side search/filter over a server-provided catalog (data-driven).
export function SkillGrid({ skills }: { skills: readonly SkillCatalogEntry[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.title, s.description, s.category, s.difficulty, s.sourceLabel]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, skills]);

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search skills…"
        aria-label="Search skills"
        className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No skills match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}
