import { getSkillDefinition } from "@/lib/skills/catalog";
import { selectFocusMarker } from "@/lib/evaluation/focus-marker";
export { selectFocusMarker } from "@/lib/evaluation/focus-marker";
import { metricLabel } from "@/lib/evaluation/metric-labels";
import type { ReplayMarker } from "@/types";
import { MAX_SPEECH_TEXT_LENGTH } from "@/lib/voice/speech-contract";
import type { ReplayReviewExcerpt } from "./replay-types";

/**
 * Narration input for replay. B9 can later set `review.replayNarration` on the
 * attempt package; this module will speak that string instead of the
 * deterministic marker sentence. It never calls a model and never scores motion.
 */
export interface ReplayNarrationInput {
  skillId: string;
  markers: readonly ReplayMarker[];
  review?: ReplayReviewExcerpt | null;
  /**
   * Issue the replay is showing. Omit it to focus the highest-severity marker.
   * B8 passes the clicked worst moment here.
   */
  focus?: ReplayMarker | null;
}

export type ReplayNarrationSource = "review" | "marker" | "none";

export interface ReplayNarrationPlan {
  text: string | null;
  source: ReplayNarrationSource;
  /** Highest-severity marker, or null when the attempt recorded none. */
  marker: ReplayMarker | null;
}

function clip(text: string): string {
  return text.trim().slice(0, MAX_SPEECH_TEXT_LENGTH);
}

function sameMoment(a: ReplayMarker, b: ReplayMarker): boolean {
  return a.tMs === b.tMs && a.segmentId === b.segmentId && a.metricId === b.metricId && a.severity === b.severity;
}

function skillTitle(skillId: string): string {
  return getSkillDefinition(skillId)?.title ?? skillId.replace(/[-_]/g, " ");
}

function segmentTitle(skillId: string, segmentId: string): string {
  return getSkillDefinition(skillId)?.segments.find(segment => segment.id === segmentId)?.title ?? segmentId.replace(/[-_]/g, " ");
}

function evidenceClause(marker: ReplayMarker): string {
  const bits: string[] = [];
  const data = marker.explanationData;
  if (typeof data.tipErrorUnits === "number") bits.push(`tip difference ${data.tipErrorUnits} scene units`);
  if (typeof data.orientationErrorDeg === "number") bits.push(`orientation difference ${data.orientationErrorDeg} degrees`);
  for (const [key, value] of Object.entries(data)) {
    if (key === "tipErrorUnits" || key === "orientationErrorDeg") continue;
    bits.push(`${key} ${String(value)}`);
  }
  const detail = bits.length ? `, ${bits.join(", ")}` : "";
  return `${metricLabel(marker.metricId)} (${marker.metricId})${detail}. Severity ${Math.round(marker.severity * 100)} out of 100.`;
}

/** Deterministic sentence from marker evidence. Not a model response. */
export function markerNarration(marker: ReplayMarker, skillId: string): string {
  return clip(`${skillTitle(skillId)}, ${segmentTitle(skillId, marker.segmentId)}: the recorded difference is ${evidenceClause(marker)}`);
}

export function planReplayNarration(input: ReplayNarrationInput): ReplayNarrationPlan {
  const top = selectFocusMarker(input.markers);
  const marker = input.focus ?? top;
  const reviewText = clip(input.review?.replayNarration ?? "");
  // B8's replayNarration describes the largest gap. Speak it when this view is
  // that moment. A different issue keeps its own marker sentence so the words
  // match the picture. B9 replaces the review string without a second player.
  const describesThisMarker = !marker || !top || sameMoment(marker, top);
  if (reviewText && describesThisMarker) return { text: reviewText, source: "review", marker };
  if (!marker) return { text: null, source: "none", marker: null };
  return { text: markerNarration(marker, input.skillId), source: "marker", marker };
}
