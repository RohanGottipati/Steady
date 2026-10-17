import { type ReferenceMotion, referenceMotionSchema } from "@/types/motion";

// Validate untrusted reference data (from an adapter output or the recorder)
// against the canonical contract. Throws on malformed input so bad references
// never reach the ghost/evaluation systems.
export function parseReference(data: unknown): ReferenceMotion {
  return referenceMotionSchema.parse(data);
}

// Load a reference motion JSON by URL (e.g. /references/<skill>/<ref>.json) and
// validate it. Browser-usable via fetch.
export async function loadReference(url: string): Promise<ReferenceMotion> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load reference motion from ${url}: ${res.status}`);
  }
  return parseReference(await res.json());
}
