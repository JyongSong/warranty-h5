"use client";

import { useSyncExternalStore } from "react";

// "처리 필요/예외" 신규 알림의 브라우저별 상태.
// 설정(알림음/브라우저 알림 켜기)은 이 브라우저에만 저장된다. 관리자마다 자기 PC 에서 켜고 끈다.

export const ATTENTION_ALERT_SOUND_SRC = "/sounds/attention-alert.mp3";
export const ATTENTION_ALERT_TARGET_HREF = "/backoffice/installations?statusView=attention";

const SETTINGS_STORAGE_KEY = "backoffice-attention-alert-settings-v1";
// 이미 알린 처리 필요 건 id. 탭이 여러 개여도 같은 건으로 두 번 울리지 않도록 탭끼리 공유한다.
const KNOWN_IDS_STORAGE_KEY = "backoffice-attention-known-ids-v1";

export type AttentionAlertSettings = {
  sound: boolean;
  notification: boolean;
};

export const DEFAULT_ATTENTION_ALERT_SETTINGS: AttentionAlertSettings = {
  sound: true,
  notification: true,
};

export function parseAttentionAlertSettings(raw: string | null): AttentionAlertSettings {
  if (!raw) return DEFAULT_ATTENTION_ALERT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AttentionAlertSettings>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULT_ATTENTION_ALERT_SETTINGS.sound,
      notification:
        typeof parsed.notification === "boolean" ? parsed.notification : DEFAULT_ATTENTION_ALERT_SETTINGS.notification,
    };
  } catch {
    return DEFAULT_ATTENTION_ALERT_SETTINGS;
  }
}

// known 이 null 이면 이 브라우저에서 처음 확인하는 것이므로 지금 있는 건은 알리지 않고 기준으로만 삼는다.
// 처리가 끝나 목록에서 빠진 건은 known 에서도 지우므로, 나중에 다시 처리 필요가 되면 또 알린다.
export function diffAttentionIds(known: string[] | null, current: string[]) {
  if (known === null) return { newIds: [] as string[], nextKnown: current };
  const knownSet = new Set(known);
  return {
    newIds: current.filter((id) => !knownSet.has(id)),
    nextKnown: current,
  };
}

function safeGetItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 쓰는 브라우저(시크릿 모드 등)에서는 이번 화면에서만 기억한다.
  }
}

export function readKnownAttentionIds(): string[] | null {
  const raw = safeGetItem(KNOWN_IDS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : null;
  } catch {
    return null;
  }
}

export function writeKnownAttentionIds(ids: string[]) {
  safeSetItem(KNOWN_IDS_STORAGE_KEY, JSON.stringify(ids));
}

// --- 설정 store ---

const settingsListeners = new Set<() => void>();
let cachedSettingsRaw: string | null | undefined;
let cachedSettings = DEFAULT_ATTENTION_ALERT_SETTINGS;

function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    settingsListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAttentionAlertSettings(): AttentionAlertSettings {
  const raw = safeGetItem(SETTINGS_STORAGE_KEY);
  // useSyncExternalStore 는 같은 값이면 같은 객체를 돌려줘야 하므로 원문이 같으면 캐시를 쓴다.
  if (raw !== cachedSettingsRaw) {
    cachedSettingsRaw = raw;
    cachedSettings = parseAttentionAlertSettings(raw);
  }
  return cachedSettings;
}

export function setAttentionAlertSettings(next: Partial<AttentionAlertSettings>) {
  const merged = { ...getAttentionAlertSettings(), ...next };
  safeSetItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  settingsListeners.forEach((listener) => listener());
}

export function useAttentionAlertSettings() {
  return useSyncExternalStore(subscribeSettings, getAttentionAlertSettings, () => DEFAULT_ATTENTION_ALERT_SETTINGS);
}

// --- 처리 필요 건수 store (사이드바 숫자 표시용, 탭 안에서만) ---

const countListeners = new Set<() => void>();
let attentionCount: number | null = null;

export function setAttentionCount(count: number) {
  if (attentionCount === count) return;
  attentionCount = count;
  countListeners.forEach((listener) => listener());
}

function subscribeCount(listener: () => void) {
  countListeners.add(listener);
  return () => {
    countListeners.delete(listener);
  };
}

export function useAttentionCount() {
  return useSyncExternalStore(
    subscribeCount,
    () => attentionCount,
    () => null,
  );
}

// --- 알림음 ---

let alertAudio: HTMLAudioElement | null = null;

export async function playAttentionAlertSound() {
  if (!alertAudio) alertAudio = new Audio(ATTENTION_ALERT_SOUND_SRC);
  alertAudio.currentTime = 0;
  // 페이지를 한 번도 클릭하지 않았으면 브라우저가 소리를 막는다. 그때는 조용히 넘어간다.
  return alertAudio.play().then(
    () => true,
    () => false,
  );
}

export function canUseBrowserNotification() {
  return typeof window !== "undefined" && "Notification" in window;
}
