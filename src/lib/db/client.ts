import "server-only";
import postgres from "postgres";

// Server-only Tiger Data client (singleton). The browser never receives
// database credentials. Returns null when TIGER_DATABASE_URL is unset so the
// app degrades gracefully instead of crashing (see plan 3.4 rule 3).
let client: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> | null {
  const url = process.env.TIGER_DATABASE_URL;
  if (!url) return null;
  if (!client) {
    client = postgres(url, {
      ssl: "require",
      onnotice: () => {},
      connect_timeout: 5,
      idle_timeout: 20,
      max: 3,
    });
  }
  return client;
}
