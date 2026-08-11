import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { requireInstallerApi } from "@/lib/installer/session";
import { saveInstallerDevice } from "@/lib/installer/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the in-app push registration once it has an FCM token. Same-origin
// (the Capacitor shell loads the site remotely), so the session cookie is sent
// automatically — no CORS needed.
export async function POST(req: Request) {
  const { installer, errorResponse } = await requireInstallerApi();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }
    await saveInstallerDevice(installer.id, token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "DEVICE_REGISTER_FAILED") },
      { status: 500 },
    );
  }
}
