import { getErrorMessage } from "@/lib/error";
import { getFcm } from "@/lib/push-test/fcm";
import { deleteFcmToken, listFcmTokens } from "@/lib/push-test/fcm-store";
import { corsJson, corsPreflight } from "@/lib/push-test/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendToAll(message: string) {
  const tokens = await listFcmTokens();
  if (tokens.length === 0) {
    return { sentAt: null, count: 0, success: 0, failure: 0, note: "NO_TOKENS" };
  }

  const sentAt = new Date().toISOString();
  const res = await getFcm().sendEachForMulticast({
    tokens,
    notification: {
      title: "새 작업 배정 (테스트)",
      body: message ? message : `발송 시각 ${sentAt}`,
    },
    data: { sentAt },
    android: {
      // High priority is what wakes an Android device out of Doze — the whole
      // point of the native-FCM path vs Web Push.
      priority: "high",
      notification: { channelId: "dispatch", sound: "default" },
    },
  });

  // Prune tokens the FCM service reports as permanently invalid.
  await Promise.all(
    res.responses.map(async (r, i) => {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        await deleteFcmToken(tokens[i]);
      }
    }),
  );

  return {
    sentAt,
    count: tokens.length,
    success: res.successCount,
    failure: res.failureCount,
    errors: res.responses.filter((r) => r.error).map((r) => r.error?.code),
  };
}

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  try {
    const message = new URL(req.url).searchParams.get("message") ?? "";
    return corsJson(await sendToAll(message));
  } catch (error) {
    return corsJson({ error: getErrorMessage(error, "FCM_SEND_FAILED") }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    return corsJson(await sendToAll(String(body?.message ?? "")));
  } catch (error) {
    return corsJson({ error: getErrorMessage(error, "FCM_SEND_FAILED") }, 500);
  }
}
