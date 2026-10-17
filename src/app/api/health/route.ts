import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "steady",
    timestamp: new Date().toISOString(),
  });
}
