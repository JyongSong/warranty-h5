"use client";

/**
 * 사용 안내를 이미 봤는지. 기기에만 남긴다(localStorage).
 *
 * DB 에 두면 기기를 바꿔도 다시 안 뜨지만, 새 기기·재설치 때 한 번 더 보는 편이
 * 오히려 낫고 스키마 변경도 필요 없다.
 *
 * 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서는 조용히 "봤다"로 처리한다.
 * 안내를 못 띄우는 것보다 매번 다시 띄우는 쪽이 성가시다.
 */
const STORAGE_KEY = "installer.guide.seen.v1";

export function hasSeenInstallerGuide(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markInstallerGuideSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // 저장할 수 없으면 이번 세션에만 안 뜨는 셈이다. 흐름을 막지는 않는다.
  }
}
