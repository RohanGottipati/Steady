import { getSkillDefinition } from "@/lib/skills/catalog";
import { type AttemptDb } from "@/lib/db/persist-attempt";
import { attemptUploadPayloadSchema, type AttemptUploadPayload } from "@/types/attempt";

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
  const full = attemptUploadPayloadSchema.safeParse(payload);
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
  },
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
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
