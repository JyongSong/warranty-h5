import { NextResponse } from "next/server";

// The C1' spike harness runs as local Capacitor content (localhost origin) and
// calls these endpoints cross-origin, so they need permissive CORS. The real
// app loads the remote URL same-origin and won't need this.
export const PUSH_TEST_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function corsJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PUSH_TEST_CORS });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: PUSH_TEST_CORS });
}
