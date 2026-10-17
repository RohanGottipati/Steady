# Repository guidance

This file is intentionally tracked. The marked block below is maintained by
`next dev` for the installed Next.js version; it is generated framework guidance,
not a hand-authored project policy. Keep this provenance note outside the markers
so framework updates can refresh their block. Project ownership and workflow
rules live in `docs/CONTEXT.md` and `docs/IMPLEMENTATION_PLAN.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
