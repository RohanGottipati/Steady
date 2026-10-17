import {
  attemptUploadPayloadSchema,
  type AttemptUploadPayload,
  type CloudSyncStatus,
  type SavedAttempt,
} from "@/types/attempt";
import { listSavedAttempts, markCloudSyncStatus } from "./attempt-cache";

export type CloudSyncResult = "synced" | "local-only" | "skipped";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_KEY = "steady.anonymousUserId";
const inflight = new Map<string, Promise<CloudSyncResult>>();

export interface SyncOptions {
  fetchFn?: typeof fetch;
  endpoint?: string;
  enabled?: boolean;
  userId?: string;
  updateStatus?: (id: string, status: CloudSyncStatus) => Promise<void>;
}

export function resetCloudSyncForTests(): void {
  inflight.clear();
}

export function anonymousUserId(): string {
  if (typeof localStorage === "undefined") return crypto.randomUUID();
  try {
    const existing = localStorage.getItem(USER_KEY);
    if (existing && UUID.test(existing)) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(USER_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function buildAttemptUpload(attempt: SavedAttempt, userId = anonymousUserId()): AttemptUploadPayload | null {
  if (!UUID.test(attempt.result.id) || !UUID.test(userId)) return null;
  const completedAt = new Date(attempt.result.createdAt);
  if (Number.isNaN(completedAt.getTime())) return null;
  const parsed = attemptUploadPayloadSchema.safeParse({
    attempt: {
      id: attempt.result.id,
      anonymousUserId: userId,
      skillId: attempt.result.skillId,
      mode: attempt.result.mode,
      startedAt: new Date(completedAt.getTime() - attempt.result.durationMs).toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: attempt.result.durationMs,
      result: attempt.result,
    },
    motionSamples: [],
    metricSamples: [],
    coachingEvents: attempt.result.importantEvents,
  });
  return parsed.success ? parsed.data : null;
}

function asOptions(options?: SyncOptions | typeof fetch): SyncOptions {
  if (typeof options === "function") return { fetchFn: options };
  return options ?? {};
}

async function runSync(attempt: SavedAttempt, options: SyncOptions): Promise<CloudSyncResult> {
  const updateStatus = options.updateStatus ?? markCloudSyncStatus;
  const enabled = options.enabled ?? process.env.NEXT_PUBLIC_ENABLE_CLOUD_SYNC !== "false";
  const mark = async (status: CloudSyncStatus) => {
    try {
      await updateStatus(attempt.result.id, status);
    } catch {
      /* Local results stay usable when the status write fails. */
    }
  };
  if (!enabled) return "skipped";
  if (attempt.cloudSyncStatus === "synced") return "synced";
  const payload = buildAttemptUpload(attempt, options.userId);
  if (!payload) {
    await mark("failed");
    return "local-only";
  }
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(options.endpoint ?? "/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => null) as { status?: string; persistence?: string } | null;
    const persistence = body?.status ?? body?.persistence;
    if (!response.ok || (persistence !== "synced" && persistence !== "duplicate")) {
      await mark("failed");
      return "local-only";
    }
    attempt.cloudSyncStatus = "synced";
    await mark("synced");
    return "synced";
  } catch {
    await mark("failed");
    return "local-only";
  }
}

/**
 * Uploads one saved attempt. An in-flight call for the same id is reused, so a
 * double retry cannot create a second upload. Failure leaves the local copy usable.
 */
export function syncSavedAttempt(
  attempt: SavedAttempt,
  options?: SyncOptions | typeof fetch,
): Promise<CloudSyncResult> {
  const id = attempt?.result?.id;
  if (!id) return Promise.resolve("local-only");
  const current = inflight.get(id);
  if (current) return current;
  const pending = runSync(attempt, asOptions(options)).finally(() => {
    if (inflight.get(id) === pending) inflight.delete(id);
  });
  inflight.set(id, pending);
  return pending;
}

/** Retries IndexedDB copies that are still pending or failed. Does not create attempts. */
export async function retryUnsyncedAttempts(options?: SyncOptions | typeof fetch): Promise<void> {
  let pending: SavedAttempt[] = [];
  try {
    pending = (await listSavedAttempts()).filter(item => item.cloudSyncStatus !== "synced");
  } catch {
    return;
  }
  for (const attempt of pending) {
    try {
      await syncSavedAttempt(attempt, options);
    } catch {
      /* One failed retry must not block the rest of the session. */
    }
  }
}
