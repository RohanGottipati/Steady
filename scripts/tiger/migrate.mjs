// Versioned SQL migration runner for Tiger Data.
// Applies db/migrations/*.sql in filename order exactly once, tracked in
// schema_migrations. Safe to re-run (idempotent). Usage: npm run db:migrate
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "./db.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "db/migrations");

export async function migrate(sql, dir = MIGRATIONS_DIR) {
  await sql`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = [];
  for (const file of files) {
    const [already] = await sql`select 1 from schema_migrations where filename = ${file}`;
    if (already) continue;
    const content = readFileSync(resolve(dir, file), "utf8");
    await sql.unsafe(content);
    await sql`insert into schema_migrations (filename) values (${file})`;
    applied.push(file);
  }
  return applied;
}

// CLI entry point.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = connect();
  try {
    const applied = await migrate(sql);
    console.log(
      applied.length ? `Applied migrations: ${applied.join(", ")}` : "No pending migrations.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
