"use client";

/**
 * 외부 사이트(팝빌 등)를 연다.
 * - 기사 앱(Capacitor 쉘): 같은 창 이동으로 넘긴다. Capacitor 는 앱 도메인이 아닌 주소로의 이동을 막고
 *   휴대폰 기본 브라우저로 연다. 새 창(window.open)은 앱 웹뷰에서 열리지 않거나 앱 화면을 빈 페이지로 바꿀 수 있어 쓰지 않는다.
 * - 일반 브라우저: 새 탭으로 연다.
 */

type CapacitorBridge = { isNativePlatform?: () => boolean };

export function isInstallerApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** 주소를 이미 알 때 */
export function openExternalUrl(url: string): void {
  if (isInstallerApp()) {
    window.location.href = url;
    return;
  }
  const win = window.open(url, "_blank", "noopener");
  if (!win) window.location.href = url;
}

/**
 * 주소를 서버에서 받아 와야 할 때(팝빌 팝업 URL 등). 일반 브라우저는 팝업 차단을 피하려고 클릭 순간 빈 탭을 먼저 연다.
 * getUrl 이 실패하면 열어 둔 탭을 닫고 오류 코드를 돌려준다.
 */
export async function openExternalAsync(
  getUrl: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const app = isInstallerApp();
  const win = app ? null : window.open("about:blank", "_blank");
  const r = await getUrl();
  if (!r.ok) {
    win?.close();
    return r;
  }
  if (win) win.location.href = r.url;
  else window.location.href = r.url;
  return { ok: true };
}
