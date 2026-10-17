# Decisions Log

Record architectural and product decisions here as they are made.

## Format

### YYYY-MM-DD - Decision title
- Context:
- Decision:
- Consequences:

### 2026-10-17 - A1 raw snapshots, local assets, and worker compatibility
- Context: Person A needs webcam tracking before A2, but shared `HandFrame` requires
  calibrated pinch/rotation. The installed SDK is MediaPipe Tasks Vision 1.1.1.
- Decision: A1 uses local raw tracking types/ref snapshots with explicit missing
  observations; shared contracts remain unchanged. Prepare a pinned/checksummed
  model and matching installed WASM before dev/build. Host them at the same origin.
  Use a bundled classic worker and the classic WASM loader: actual browser testing
  found Turbopack rewrites module workers to classic workers, where the ES-module
  loader throws on `import.meta`. Retain throttled main-thread GPU/CPU fallback.
- Consequences: A2 owns calibrated conversion to `HandFrame` and scene coordinates.
  Fresh builds need asset preparation; cached assets support offline use. A hidden
  development-only tracking route is the A1 integration surface. Playwright uses
  localhost to match Next's advertised dev origin and permit client hydration.
  SDK metrics telemetry is distinct from Steady's prohibition on raw-video uploads.

### 2026-10-16 - Canonical PerformanceVector metric names
- Context: IMPLEMENTATION_PLAN §6.9 / §13.3 and §6.11 listed different camelCase aliases for the same 20 metrics (e.g. `instrumentOrientationAccuracy` vs `instrumentAngleAccuracy`).
- Decision: Use §6.9 / §13.3 names as the TypeScript + `PERFORMANCE_VECTOR_ORDER` source of truth. Treat §6.11 aliases as obsolete wording.
- Consequences: Tiger `vector(20)` conversion, similarity queries, and fixtures must use these keys. Renaming later is a schema migration.
