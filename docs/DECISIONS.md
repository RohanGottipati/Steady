# Decisions Log

Record architectural and product decisions here as they are made.

## Format

### YYYY-MM-DD - Decision title
- Context:
- Decision:
- Consequences:

### 2026-10-16 - Canonical PerformanceVector metric names
- Context: IMPLEMENTATION_PLAN §6.9 / §13.3 and §6.11 listed different camelCase aliases for the same 20 metrics (e.g. `instrumentOrientationAccuracy` vs `instrumentAngleAccuracy`).
- Decision: Use §6.9 / §13.3 names as the TypeScript + `PERFORMANCE_VECTOR_ORDER` source of truth. Treat §6.11 aliases as obsolete wording.
- Consequences: Tiger `vector(20)` conversion, similarity queries, and fixtures must use these keys. Renaming later is a schema migration.
