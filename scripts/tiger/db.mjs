// Shared Tiger Data connection helpers for migration/seed scripts and tests.
// Server/CLI only. Reads TIGER_DATABASE_URL from the environment or .env.local.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const ROOT = resolve(import.meta.dirname, "../..");
const ENV_PATH = resolve(ROOT, ".env.local");

// Minimal .env.local parser (mirrors scripts/setup/verify-ai-services.mjs).
export function loadEnvLocal(path = ENV_PATH) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// Empty string when unset so callers can treat it as falsy (e.g. skip tests).
export function getDatabaseUrl() {
  return process.env.TIGER_DATABASE_URL || loadEnvLocal().TIGER_DATABASE_URL || "";
}

export function connect(url = getDatabaseUrl()) {
  if (!url) {
    throw new Error("TIGER_DATABASE_URL is not set; cannot connect to Tiger Data.");
  }
  return postgres(url, { ssl: "require", onnotice: () => {} });
}
