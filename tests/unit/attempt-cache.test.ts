import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import type { SavedAttempt } from "@/types";

const fake = vi.hoisted(() => ({ entries: new Map<string, unknown>(), quota: false }));
vi.mock("idb", () => ({ openDB: vi.fn(async () => {
  const store = {
    put: async (value: SavedAttempt) => { if (fake.quota) throw new Error("Quota exceeded"); fake.entries.set(value.result.id, structuredClone(value)); },
    getAll: async () => [...fake.entries.values()], getAllKeys: async () => [...fake.entries.keys()],
    delete: async (key: string) => { fake.entries.delete(key); },
  };
  return { transaction: () => ({ store, done: Promise.resolve() }),
    get: async (_store: string, key: string) => fake.entries.get(key), getAll: store.getAll,
    clear: async () => { fake.entries.clear(); } };
}) }));
const attempt = evaluateCompletedAttempt({ recorded: { skillId: "needle-passing", frames: DEFAULT_NEEDLE_PASSING_REFERENCE.frames } }).savedAttempt;
function saved(id: string, index = 0): SavedAttempt {
  return { ...attempt, result: { ...attempt.result, id, createdAt: new Date(1700000000000 + index * 1000).toISOString() } };
}
beforeEach(() => {
  vi.resetModules(); fake.entries.clear(); fake.quota = false; vi.stubGlobal("indexedDB", {});
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("S1 asynchronous attempt cache", () => {
  it("retrieves saved attempts after a fresh module load and upserts duplicate IDs", async () => {
    let cache = await import("@/lib/storage/attempt-cache");
    expect(await cache.saveCompletedAttempt(saved("one"))).toBe("indexeddb");
    await cache.saveCompletedAttempt({ ...saved("one"), result: { ...saved("one").result, overallScore: 42 } });
    vi.resetModules(); cache = await import("@/lib/storage/attempt-cache");
    const loaded = await cache.getSavedAttempt("one");
    expect(loaded?.result.overallScore).toBe(42);
    loaded!.result.overallScore = 0;
    expect((await cache.getSavedAttempt("one"))?.result.overallScore).toBe(42);
    expect(fake.entries.size).toBe(1);
    expect((await cache.getLatestSavedAttempt("needle-passing"))?.result.id).toBe("one");
    expect(await cache.getLatestSavedAttempt("suturing")).toBeNull();
    await cache.markCloudSyncStatus("one", "failed");
    expect(fake.entries.size).toBe(1);
    expect((await cache.getSavedAttempt("one"))?.cloudSyncStatus).toBe("failed");
    await cache.markCloudSyncStatus("one", "synced");
    expect((await cache.getSavedAttempt("one"))?.cloudSyncStatus).toBe("synced");
    await cache.markCloudSyncStatus("missing", "failed");
    expect(fake.entries.size).toBe(1);
  });
  it("serializes concurrent writes, retains the newest 20, and clears durable and memory state", async () => {
    const cache = await import("@/lib/storage/attempt-cache");
    await Promise.all(Array.from({ length: 23 }, (_, index) => cache.saveCompletedAttempt(saved(`id-${index}`, index))));
    expect(fake.entries.size).toBe(20);
    expect(await cache.getSavedAttempt("id-0")).toBeNull();
    expect((await cache.getLatestSavedAttempt())?.result.id).toBe("id-22");
    await cache.clearSavedAttempts(); expect(fake.entries.size).toBe(0);
    expect(await cache.getLatestSavedAttempt()).toBeNull();
  });
  it("ignores corrupt records and deletes them on the next write", async () => {
    fake.entries.set("bad", { result: { id: "bad" } });
    const cache = await import("@/lib/storage/attempt-cache");
    expect(await cache.getSavedAttempt("bad")).toBeNull();
    expect(await cache.getLatestSavedAttempt()).toBeNull();
    await cache.saveCompletedAttempt(saved("valid"));
    expect(fake.entries.has("bad")).toBe(false);
  });
  it("falls back promptly when opening device storage is blocked", async () => {
    vi.useFakeTimers();
    vi.mocked(openDB).mockImplementationOnce(() => new Promise<never>(() => {}));
    const cache = await import("@/lib/storage/attempt-cache");
    const write = cache.saveCompletedAttempt(saved("blocked"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(await write).toBe("memory");
    expect((await cache.getSavedAttempt("blocked"))?.result.id).toBe("blocked");
  });
  it.each(["unavailable", "quota"])("keeps results usable when storage is %s", async failure => {
    if (failure === "unavailable") vi.stubGlobal("indexedDB", undefined);
    else fake.quota = true;
    const cache = await import("@/lib/storage/attempt-cache");
    expect(await cache.saveCompletedAttempt(saved("local"))).toBe("memory");
    const result = await cache.getSavedAttempt("local");
    expect(result?.result.id).toBe("local");
    result!.result.overallScore = -1;
    expect((await cache.getSavedAttempt("local"))?.result.overallScore).toBe(attempt.result.overallScore);
  });
});
