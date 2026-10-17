import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCatalogEntry } from "@/lib/skills/catalog";

// This tiny catalog check deliberately completes before streaming the page.
export const instant = false;

// Validate before this segment's loading boundary starts streaming the trainer.
// Unknown skills should render a normal 404, not abort a streamed page boundary.
export default async function SkillLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;
  if (!getCatalogEntry(skillId)) notFound();
  return children;
}
