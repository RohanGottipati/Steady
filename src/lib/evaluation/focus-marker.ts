import type { ReplayMarker } from "@/types";

/** One stable focus for the results explanation, server review and visual replay. */
export function selectFocusMarker(markers: readonly ReplayMarker[]): ReplayMarker | null {
  return markers.filter(marker => Number.isFinite(marker.severity) && Number.isFinite(marker.tMs))
    .map((marker, index) => ({ marker, index }))
    .sort((a, b) => b.marker.severity - a.marker.severity || a.marker.tMs - b.marker.tMs
      || a.marker.metricId.localeCompare(b.marker.metricId)
      || a.marker.segmentId.localeCompare(b.marker.segmentId) || a.index - b.index)[0]?.marker ?? null;
}
