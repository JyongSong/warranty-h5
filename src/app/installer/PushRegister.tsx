"use client";

import { useEffect } from "react";

// Runs only inside the Capacitor shell: requests notification permission,
// registers with FCM, and posts the device token to the backend (same-origin,
// so the session cookie authorizes it). No-op in a plain browser.

type PushPlugin = {
  createChannel?: (opts: Record<string, unknown>) => Promise<void>;
  addListener: (event: string, cb: (data: { value?: string }) => void) => void;
  requestPermissions: () => Promise<{ receive?: string }>;
  register: () => Promise<void>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: { PushNotifications?: PushPlugin };
};

export default function PushRegister() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const push = cap.Plugins?.PushNotifications;
    if (!push) return;

    // High-importance channel the server sends to (Android 8+ drops posts to a
    // missing channel).
    push
      .createChannel?.({
        id: "dispatch",
        name: "배차 알림",
        description: "새 작업 배정 알림",
        importance: 5,
        visibility: 1,
      })
      .catch(() => {});

    push.addListener("registration", (data) => {
      const token = data?.value;
      if (!token) return;
      void fetch("/api/installer/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    });
    push.addListener("registrationError", () => {});

    void (async () => {
      try {
        const perm = await push.requestPermissions();
        if (perm?.receive === "granted") await push.register();
      } catch {
        // ignore — SMS fallback still covers notification
      }
    })();
  }, []);

  return null;
}
