"use server";

import { getCurrentInstaller } from "@/lib/installer/session";
import { markNoticeRead } from "@/lib/installer/inbox";

/** 공지 팝업 「확인했습니다」 */
export async function markNoticeReadAction(noticeId: string): Promise<{ ok: boolean }> {
  const installer = await getCurrentInstaller();
  if (!installer) return { ok: false };
  try {
    await markNoticeRead(installer.id, noticeId);
    return { ok: true };
  } catch (error) {
    console.error("[installer/inbox/read]", error);
    return { ok: false };
  }
}
