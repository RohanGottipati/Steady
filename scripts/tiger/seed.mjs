// Seed runner for Tiger Data. Applies db/seeds/*.sql in filename order.
// Seed files must be idempotent (ON CONFLICT / NOT EXISTS). Usage: npm run db:seed
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "./db.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SEEDS_DIR = resolve(ROOT, "db/seeds");

export async function seed(sql, dir = SEEDS_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    await sql.unsafe(readFileSync(resolve(dir, file), "utf8"));
  }
  return files;
}

// CLI entry point.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = connect();
  try {
    const files = await seed(sql);
    console.log(files.length ? `Applied seeds: ${files.join(", ")}` : "No seed files found.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}
