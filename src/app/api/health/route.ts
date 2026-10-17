import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { databaseStatus } from "@/lib/db/health";

export async function GET() {
  const db = await databaseStatus(getDb());
  return NextResponse.json({
    ok: true,
    service: "steady",
    db,
    timestamp: new Date().toISOString(),
  });
}
