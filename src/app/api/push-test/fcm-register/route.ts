import { getErrorMessage } from "@/lib/error";
import { saveFcmToken } from "@/lib/push-test/fcm-store";
import { corsJson, corsPreflight } from "@/lib/push-test/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) {
      return corsJson({ error: "MISSING_TOKEN" }, 400);
    }
    await saveFcmToken(token);
    return corsJson({ ok: true });
  } catch (error) {
    return corsJson({ error: getErrorMessage(error, "FCM_REGISTER_FAILED") }, 500);
  }
}
