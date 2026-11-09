import { prisma } from "@/lib/prisma";
import { getInstallerFcm, isFcmConfigured } from "@/lib/installer/firebase";

export async function saveInstallerDevice(installerId: string, fcmToken: string) {
  await prisma.installerDevice.upsert({
    where: { fcmToken },
    create: { installerId, fcmToken, platform: "android" },
    update: { installerId, lastSeenAt: new Date() },
  });
}

export async function deleteInstallerDevice(fcmToken: string) {
  await prisma.installerDevice.deleteMany({ where: { fcmToken } });
}

/**
 * 기사 앱(푸시 기기)이 등록된 기사 id 와 마지막 등록 시각.
 * 앱을 지우면 토큰이 남아 있다가 푸시 실패 때 지워지므로, "앱 설치" 는 등록된 기기가 있다는 뜻이다.
 */
export async function listInstallerAppStatus(installerIds: string[]): Promise<Map<string, Date>> {
  const ids = [...new Set(installerIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.installerDevice.groupBy({
    by: ["installerId"],
    where: { installerId: { in: ids } },
    _max: { lastSeenAt: true },
  });
  return new Map(rows.flatMap((row) => (row._max.lastSeenAt ? [[row.installerId, row._max.lastSeenAt] as const] : [])));
}

export async function listInstallerDeviceTokens(installerId: string): Promise<string[]> {
  const rows = await prisma.installerDevice.findMany({
    where: { installerId },
    select: { fcmToken: true },
  });
  return rows.map((r) => r.fcmToken);
}

// Fire a high-priority FCM notification to all of an installer's devices.
// High priority is what wakes an Android device out of Doze (validated in the
// C1' spike). SMS remains the fallback, so failures here only log.
// Returns how many devices FCM accepted the message for; 0 means nothing went
// out (no devices, or every token was rejected), so callers can fall back to SMS.
export async function sendAssignmentPushToInstaller(
  installerId: string,
  { title, body }: { title: string; body: string },
): Promise<number> {
  if (!isFcmConfigured()) return 0;

  const tokens = await listInstallerDeviceTokens(installerId);
  if (tokens.length === 0) return 0;

  const res = await getInstallerFcm().sendEachForMulticast({
    tokens,
    notification: { title, body },
    android: {
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
        await deleteInstallerDevice(tokens[i]);
      }
    }),
  );

  return res.successCount;
}
