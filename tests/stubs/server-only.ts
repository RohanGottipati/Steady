// Test stub for the `server-only` guard. In production this import throws when
// pulled into a client bundle; under vitest we neutralize it so server modules
// (e.g. src/lib/db/client.ts) can be imported and exercised directly.
export {};
