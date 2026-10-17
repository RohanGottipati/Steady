import { getSkillDefinition } from "@/lib/skills/catalog";
import { type AttemptDb } from "@/lib/db/persist-attempt";
import { attemptUploadPayloadSchema, type AttemptUploadPayload } from "@/types/attempt";
import { createRateLimiter, type RateLimiter } from "@/lib/voice/rate-limit";
import { rateLimitRequest, readLimitedJson, RequestBodyError } from "@/lib/reliability/request-guards";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const MAX_UPLOAD_BODY_BYTES = 1024 * 1024;
export const MAX_UPLOAD_SAMPLES = 3600;
export const MAX_UPLOAD_EVENTS = 256;
export const MAX_UPLOAD_MARKERS = 20;

// Transport bounds only: shared recording/storage contracts remain unchanged.
const boundedUploadSchema = attemptUploadPayloadSchema.extend({
  attempt: attemptUploadPayloadSchema.shape.attempt.extend({
    result: attemptUploadPayloadSchema.shape.attempt.shape.result.extend({
      importantEvents: attemptUploadPayloadSchema.shape.coachingEvents.max(MAX_UPLOAD_EVENTS),
      worstMoments: attemptUploadPayloadSchema.shape.attempt.shape.result.shape.worstMoments.max(MAX_UPLOAD_MARKERS),
    }),
  }),
  motionSamples: attemptUploadPayloadSchema.shape.motionSamples.max(MAX_UPLOAD_SAMPLES),
  metricSamples: attemptUploadPayloadSchema.shape.metricSamples.max(MAX_UPLOAD_SAMPLES),
  coachingEvents: attemptUploadPayloadSchema.shape.coachingEvents.max(MAX_UPLOAD_EVENTS),
});

/**
 * POST /api/attempts — idempotent cloud copy of one completed attempt.
 * A database outage returns 503 and does not block the local result.
 */
function localOnly(reason: "unconfigured" | "unavailable" | "down") {
  return Response.json(
    { error: "tiger unavailable", db: reason === "unavailable" ? "down" : reason, persistence: "local-only", reason },
    { status: 503 },
  );
}

function toUpload(payload: unknown): AttemptUploadPayload | null {
  const full = boundedUploadSchema.safeParse(payload);
  if (!full.success) return null;
  const { attempt } = full.data;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(attempt.id) || !uuid.test(attempt.anonymousUserId)
    || !Number.isFinite(Date.parse(attempt.startedAt)) || !Number.isFinite(Date.parse(attempt.completedAt))
    || attempt.id !== attempt.result.id || attempt.skillId !== attempt.result.skillId
    || attempt.mode !== attempt.result.mode || attempt.durationMs !== attempt.result.durationMs
    || attempt.completedAt !== attempt.result.createdAt || !getSkillDefinition(attempt.skillId)) return null;
  return full.data;
}

export async function handleAttemptUpload(
  request: Request,
  deps: {
    getDb: () => AttemptDb | null;
    persist: (sql: AttemptDb, payload: AttemptUploadPayload) => Promise<"synced" | "duplicate">;
    databaseStatus?: (sql: AttemptDb) => Promise<"up" | "down" | "unconfigured">;
    rateLimiter?: RateLimiter;
  },
): Promise<Response> {
  const limited = rateLimitRequest(request, deps.rateLimiter ?? limiter);
  if (limited) return limited;
  let payload: unknown;
  try {
    payload = await readLimitedJson(request, MAX_UPLOAD_BODY_BYTES);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "invalid JSON body" },
      { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const upload = toUpload(payload);
  if (!upload) return Response.json({ error: "invalid request" }, { status: 400 });

  const sql = deps.getDb();
  if (!sql) return localOnly("unconfigured");
  try {
    const health = await (deps.databaseStatus ?? (async () => "up" as const))(sql);
    if (health !== "up") return localOnly(health === "unconfigured" ? "unconfigured" : "unavailable");
    const result = await deps.persist(sql, upload);
    const persistence = result === "duplicate" ? "duplicate" : "synced";
    return Response.json({ ok: true, status: persistence, persistence });
  } catch {
    return localOnly("unavailable");
  }
}
