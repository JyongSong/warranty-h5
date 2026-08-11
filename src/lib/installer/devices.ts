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
export async function sendAssignmentPushToInstaller(
  installerId: string,
  { title, body }: { title: string; body: string },
): Promise<void> {
  if (!isFcmConfigured()) return;

  const tokens = await listInstallerDeviceTokens(installerId);
  if (tokens.length === 0) return;

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
}
