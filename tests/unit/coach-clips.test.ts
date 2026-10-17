import { describe, it, expect } from "vitest";
import {
  COACH_CLIPS,
  COACH_CLIP_BY_TYPE,
  coachClipPath,
} from "@/lib/voice/coach-clips";
import { COACHING_MESSAGES } from "@/lib/coaching/coaching-engine";
import { coachingEventTypeSchema } from "@/types/coaching";

describe("coach clip manifest", () => {
  const allTypes = coachingEventTypeSchema.options;

  it("covers every coaching event type exactly once", () => {
    const types = COACH_CLIPS.map((c) => c.type).sort();
    expect(types).toEqual([...allTypes].sort());
    expect(new Set(types).size).toBe(allTypes.length);
  });

  it("uses the canonical B6 message text for each clip (single source of truth)", () => {
    for (const clip of COACH_CLIPS) {
      expect(clip.text).toBe(COACHING_MESSAGES[clip.type]);
    }
  });

  it("gives each clip a unique, deterministic <type>.mp3 filename", () => {
    const files = COACH_CLIPS.map((c) => c.file);
    expect(new Set(files).size).toBe(files.length);
    for (const clip of COACH_CLIPS) {
      expect(clip.file).toBe(`${clip.type}.mp3`);
    }
  });

  it("indexes clips by event type", () => {
    for (const clip of COACH_CLIPS) {
      expect(COACH_CLIP_BY_TYPE[clip.type]).toBe(clip);
    }
  });

  it("resolves a public URL under /audio/coach/", () => {
    expect(coachClipPath("path_deviation")).toBe(
      "/audio/coach/path_deviation.mp3",
    );
  });
});
