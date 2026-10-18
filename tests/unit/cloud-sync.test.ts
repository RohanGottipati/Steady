import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleAttemptResult } from "../fixtures/contracts";
import type { SavedAttempt } from "@/types";

const clearSavedAttempts = vi.hoisted(() => vi.fn(async () => true));
const markCloudSyncStatus = vi.hoisted(() => vi.fn(async () => {}));
const stored = vi.hoisted(() => ({ attempts: [] as SavedAttempt[] }));
vi.mock("@/lib/storage/attempt-cache", () => ({
  markCloudSyncStatus,
  clearSavedAttempts,
  listSavedAttempts: vi.fn(async () => stored.attempts),
  updateCloudSyncStatus: markCloudSyncStatus,
  listUnsyncedAttempts: vi.fn(async () =>
    stored.attempts.filter((item) => item.cloudSyncStatus !== "synced"),
  ),
}));

const USER = "00000000-0000-7000-8000-000000000001";

function saved(id = "11111111-1111-4111-8111-111111111111"): SavedAttempt {
  return {
    result: { ...sampleAttemptResult, id },
    userReplayFrames: [],
    cloudSyncStatus: "pending",
  };
}

describe("IndexedDB to Tiger sync", () => {
  beforeEach(async () => {
    markCloudSyncStatus.mockClear();
    clearSavedAttempts.mockReset().mockResolvedValue(true);
    stored.attempts = [];
    const { resetCloudSyncForTests } = await import("@/lib/storage/cloud-sync");
    resetCloudSyncForTests();
  });

  it("posts one compact payload and joins a repeated retry of the same id", async () => {
    const { syncSavedAttempt } = await import("@/lib/storage/cloud-sync");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      await gate;
      const body = JSON.parse(String(init?.body));
      expect(body.userReplayFrames).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/landmark|webcam/i);
      expect(body.attempt.id).toBe("11111111-1111-4111-8111-111111111111");
      return new Response(JSON.stringify({ ok: true, status: "synced" }), {
        status: 200,
      });
    });
    const attempt = saved();
    const first = syncSavedAttempt(attempt, {
      fetchFn: fetchFn as typeof fetch,
      userId: USER,
      updateStatus: markCloudSyncStatus,
    });
    const second = syncSavedAttempt(attempt, {
      fetchFn: fetchFn as typeof fetch,
      userId: USER,
      updateStatus: markCloudSyncStatus,
    });
    expect(second).toBe(first);
    release();
    await expect(first).resolves.toBe("synced");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(markCloudSyncStatus).toHaveBeenCalledWith(
      attempt.result.id,
      "synced",
    );
    await syncSavedAttempt(attempt, {
      fetchFn: fetchFn as typeof fetch,
      userId: USER,
      updateStatus: markCloudSyncStatus,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stays local when Tiger is down and when the network throws", async () => {
    const { syncSavedAttempt } = await import("@/lib/storage/cloud-sync");
    const attempt = saved();
    const down = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "tiger unavailable" }), {
          status: 503,
        }),
    );
    await expect(
      syncSavedAttempt(attempt, {
        fetchFn: down as typeof fetch,
        userId: USER,
        updateStatus: markCloudSyncStatus,
      }),
    ).resolves.toBe("local-only");
    expect(markCloudSyncStatus).toHaveBeenCalledWith(
      attempt.result.id,
      "failed",
    );
    const offline = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    await expect(
      syncSavedAttempt(attempt, {
        fetchFn: offline as typeof fetch,
        userId: USER,
        updateStatus: markCloudSyncStatus,
      }),
    ).resolves.toBe("local-only");
  });

  it("retries only unsynced local attempts and treats a duplicate server row as synced", async () => {
    const { retryUnsyncedAttempts, syncSavedAttempt } =
      await import("@/lib/storage/cloud-sync");
    const pending = saved("22222222-2222-4222-8222-222222222222");
    const done = {
      ...saved("33333333-3333-4333-8333-333333333333"),
      cloudSyncStatus: "synced" as const,
    };
    stored.attempts = [pending, done];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ ok: true, status: "duplicate" }), {
        status: 200,
      });
    });
    await retryUnsyncedAttempts({
      fetchFn: fetchFn as typeof fetch,
      userId: USER,
      updateStatus: markCloudSyncStatus,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)).attempt.id,
    ).toBe(pending.result.id);
    await expect(
      syncSavedAttempt(done, {
        fetchFn: fetchFn as typeof fetch,
        userId: USER,
      }),
    ).resolves.toBe("synced");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("history deletion and upload coordination", () => {
  beforeEach(async () => {
    (await import("@/lib/storage/cloud-sync")).resetCloudSyncForTests();
    stored.attempts = [];
    clearSavedAttempts.mockReset().mockResolvedValue(true);
  });
  it("drains uploads before deletion and blocks stale retry copies afterwards", async () => {
    const { syncSavedAttempt, deleteAttemptHistory } =
      await import("@/lib/storage/cloud-sync");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const attempt = saved();
    stored.attempts = [attempt];
    const upload = syncSavedAttempt(attempt, {
      userId: USER,
      fetchFn: (async () => {
        await gate;
        order.push("upload");
        return Response.json({ status: "synced" });
      }) as typeof fetch,
    });
    const remove = deleteAttemptHistory(USER, (async () => {
      order.push("delete");
      return Response.json({ status: "deleted" });
    }) as typeof fetch);
    expect(
      await syncSavedAttempt(saved("22222222-2222-4222-8222-222222222222")),
    ).toBe("skipped");
    expect(order).toEqual([]);
    release();
    await upload;
    await remove;
    expect(order).toEqual(["upload", "delete"]);
    expect(clearSavedAttempts).toHaveBeenCalledOnce();
    const fetchFn = vi.fn();
    expect(
      await syncSavedAttempt(
        { ...attempt, cloudSyncStatus: "pending" },
        { fetchFn },
      ),
    ).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("preserves local copies after a rejected delete", async () => {
    const { deleteAttemptHistory } = await import("@/lib/storage/cloud-sync");
    await expect(
      deleteAttemptHistory(USER, (async () =>
        Response.json({}, { status: 503 })) as typeof fetch),
    ).rejects.toThrow("Could not delete");
    expect(clearSavedAttempts).not.toHaveBeenCalled();
  });
  it("keeps uploads paused after failed device cleanup, across the next load via a persistent marker", async () => {
    const { deleteAttemptHistory, syncSavedAttempt } =
      await import("@/lib/storage/cloud-sync");
    clearSavedAttempts.mockResolvedValueOnce(false);
    await expect(
      deleteAttemptHistory(USER, (async () =>
        Response.json({ status: "deleted" })) as typeof fetch),
    ).rejects.toThrow("device cleanup failed");
    expect(localStorage.getItem("steady.historyCleanupPending")).toBe("1");
    const fetchFn = vi.fn();
    expect(await syncSavedAttempt(saved(), { fetchFn })).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
    await deleteAttemptHistory(USER, (async () =>
      Response.json({ status: "deleted" })) as typeof fetch);
    expect(localStorage.getItem("steady.historyCleanupPending")).toBeNull();
  });
});
