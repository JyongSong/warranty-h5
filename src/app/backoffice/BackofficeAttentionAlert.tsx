"use client";

import { useEffect } from "react";
import {
  ATTENTION_ALERT_TARGET_HREF,
  canUseBrowserNotification,
  diffAttentionIds,
  getAttentionAlertSettings,
  playAttentionAlertSound,
  readKnownAttentionIds,
  setAttentionCount,
  writeKnownAttentionIds,
} from "./attentionAlertStore";

const POLL_INTERVAL_MS = 30_000;

type Snapshot = { count: number; ids: string[] };

// 백오피스 화면이 열려 있는 동안(다른 탭에 있어도) "처리 필요/예외" 신규 건을 확인해서
// 알림음과 브라우저 알림을 띄운다. 화면에는 아무것도 그리지 않는다.
export default function BackofficeAttentionAlert() {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/backoffice/attention-alerts", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = (await response.json()) as Snapshot;
        if (cancelled || !Array.isArray(snapshot.ids)) return;

        setAttentionCount(snapshot.count);

        const { newIds, nextKnown } = diffAttentionIds(readKnownAttentionIds(), snapshot.ids);
        writeKnownAttentionIds(nextKnown);
        if (newIds.length > 0) notify(newIds.length, snapshot.count);
      } catch {
        // 네트워크가 잠깐 끊긴 경우 등. 다음 주기에 다시 확인한다.
      } finally {
        inFlight = false;
      }
    }

    function notify(newCount: number, totalCount: number) {
      const settings = getAttentionAlertSettings();
      if (settings.sound) void playAttentionAlertSound();

      if (settings.notification && canUseBrowserNotification() && Notification.permission === "granted") {
        const notification = new Notification(`처리 필요/예외 신규 ${newCount}건`, {
          body: `현재 처리 필요/예외 설치건 ${totalCount}건`,
          icon: "/icon.png",
          tag: "backoffice-attention",
        });
        notification.onclick = () => {
          window.focus();
          window.location.assign(ATTENTION_ALERT_TARGET_HREF);
          notification.close();
        };
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
