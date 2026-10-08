"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

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
  const pathname = usePathname();
  const tokenRef = useRef<string | null>(null);
  const savedRef = useRef(false);

  // 토큰을 서버에 올린다. 저장에 성공할 때까지는 다시 불려도 또 시도한다.
  const sendToken = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || savedRef.current) return;
    try {
      const res = await fetch("/api/installer/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) savedRef.current = true;
    } catch {
      // 다음 화면 이동 때 다시 시도한다.
    }
  }, []);

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
      tokenRef.current = token;
      savedRef.current = false;
      void sendToken();
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
  }, [sendToken]);

  // 앱을 처음 열면 로그인 화면에서 토큰이 먼저 나온다. 그때는 세션이 없어 저장이
  // 거절(401)되고, 이 컴포넌트는 레이아웃에 있어 로그인 뒤에도 다시 마운트되지
  // 않는다. 그래서 화면이 바뀔 때마다 아직 저장 못 한 토큰을 다시 올린다.
  useEffect(() => {
    void sendToken();
  }, [pathname, sendToken]);

  return null;
}
