import { getDb } from "@/lib/db/client";
import { databaseStatus } from "@/lib/db/health";
import { persistUploadedAttempt, type AttemptDb } from "@/lib/db/persist-attempt";
import { handleAttemptUpload } from "@/lib/db/attempt-upload-handler";
import { handleDeleteHistory } from "@/lib/db/history-handlers";

export async function POST(request: Request): Promise<Response> {
  return handleAttemptUpload(request, {
    getDb: () => getDb() as AttemptDb | null,
    persist: persistUploadedAttempt,
    databaseStatus: sql => databaseStatus(sql as never),
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handleDeleteHistory(request);
}
