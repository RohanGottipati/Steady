import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { savedAttemptSchema, type SavedAttempt } from "@/types/attempt";

export const ATTEMPT_DATABASE = "steady-attempts";
const MAX_CACHED_ATTEMPTS = 20;
interface AttemptDatabase extends DBSchema {
  attempts: { key: string; value: SavedAttempt };
}
export type CachePersistence = "indexeddb" | "memory";
const memory = new Map<string, SavedAttempt>();
let database: Promise<IDBPDatabase<AttemptDatabase>> | undefined;
// Serialize writes/clear so retention and retries cannot race each other.
let writes: Promise<unknown> = Promise.resolve();

function connect() {
  if (typeof window === "undefined" || !globalThis.indexedDB) {
    return Promise.reject(new Error("Local storage is unavailable."));
  }
  database ??= new Promise<IDBPDatabase<AttemptDatabase>>((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error("Device storage did not respond.")); }, 1500);
    const opening = openDB<AttemptDatabase>(ATTEMPT_DATABASE, 1, {
      upgrade(db) { db.createObjectStore("attempts", { keyPath: "result.id" }); },
      blocking() { void database?.then(db => db.close()).catch(() => {}); database = undefined; },
      terminated() { database = undefined; },
    });
    void opening.then(db => {
      clearTimeout(timer);
      if (expired) db.close();
      else resolve(db);
    }, error => { clearTimeout(timer); reject(error); });
  }).catch(error => { database = undefined; throw error; });
  return database;
}
function newest(attempts: SavedAttempt[]) {
  return attempts.sort((a, b) => b.result.createdAt.localeCompare(a.result.createdAt) || b.result.id.localeCompare(a.result.id));
}
function remember(attempt: SavedAttempt) {
  memory.set(attempt.result.id, attempt);
  for (const old of newest([...memory.values()]).slice(MAX_CACHED_ATTEMPTS)) memory.delete(old.result.id);
}
export function saveCompletedAttempt(candidate: SavedAttempt): Promise<CachePersistence> {
  const attempt = savedAttemptSchema.parse(candidate);
  remember(attempt);
  const write = writes.then(async (): Promise<CachePersistence> => {
    try {
      const db = await connect();
      const tx = db.transaction("attempts", "readwrite");
      // Attach rejection handling immediately, including quota failures before done.
      void tx.done.catch(() => {});
      await tx.store.put(attempt);
      const stored = await tx.store.getAll();
      const keys = await tx.store.getAllKeys();
      const valid = stored.flatMap(item => {
        const parsed = savedAttemptSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
      const keep = new Set(newest(valid).slice(0, MAX_CACHED_ATTEMPTS).map(item => item.result.id));
      for (let index = 0; index < stored.length; index++) {
        const parsed = savedAttemptSchema.safeParse(stored[index]);
        if (!parsed.success || !keep.has(parsed.data.result.id)) await tx.store.delete(keys[index]);
      }
      await tx.done;
      return "indexeddb";
    } catch { return "memory"; }
  });
  writes = write;
  return write;
}
export async function getSavedAttempt(id: string): Promise<SavedAttempt | null> {
  await writes;
  if (memory.has(id)) return structuredClone(memory.get(id)!);
  try {
    const parsed = savedAttemptSchema.safeParse(await (await connect()).get("attempts", id));
    if (parsed.success) { remember(parsed.data); return structuredClone(parsed.data); }
  } catch { /* Memory remains usable when persistence is unavailable. */ }
  return null;
}
export async function getLatestSavedAttempt(skillId?: string): Promise<SavedAttempt | null> {
  await writes;
  const all = new Map(memory);
  try {
    for (const item of await (await connect()).getAll("attempts")) {
      const parsed = savedAttemptSchema.safeParse(item);
      if (parsed.success && !all.has(parsed.data.result.id)) all.set(parsed.data.result.id, parsed.data);
    }
  } catch { /* Fall back to attempts completed in this tab. */ }
  const found = newest([...all.values()]).find(item => !skillId || item.result.skillId === skillId);
  return found ? structuredClone(found) : null;
}
export function clearSavedAttempts(): Promise<void> {
  memory.clear();
  const clear = writes.then(async () => {
    try { await (await connect()).clear("attempts"); } catch { /* Best effort in restricted browsers. */ }
  });
  writes = clear;
  return clear;
}
