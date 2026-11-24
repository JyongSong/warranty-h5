import "server-only";

import { prisma } from "@/lib/prisma";

/** 기사 앱 받은 공지함(백오피스 「기사 공지 발송」에서 만든다) */

export type InboxNotice = { id: string; title: string; body: string; createdAt: string; readAt: string | null };

const toView = (n: { id: string; title: string; body: string; createdAt: Date; readAt: Date | null }): InboxNotice => ({
  id: n.id,
  title: n.title,
  body: n.body,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt?.toISOString() ?? null,
});

/** 가장 오래된 안 읽은 공지 하나(팝업용). 여러 개면 확인할 때마다 다음 것이 뜬다. */
export async function getNextUnreadNotice(installerId: string): Promise<InboxNotice | null> {
  const n = await prisma.installerInboxNotice.findFirst({
    where: { installerId, readAt: null },
    orderBy: { createdAt: "asc" },
  });
  return n ? toView(n) : null;
}

export async function listInboxNotices(installerId: string, take = 50): Promise<InboxNotice[]> {
  const rows = await prisma.installerInboxNotice.findMany({
    where: { installerId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toView);
}

/** 본인 공지만 읽음 처리 */
export async function markNoticeRead(installerId: string, noticeId: string): Promise<void> {
  await prisma.installerInboxNotice.updateMany({
    where: { id: noticeId, installerId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** 공지 만들기(발송 대상 기사마다 한 줄) */
export async function createInboxNotices(input: {
  installerIds: string[];
  title: string;
  body: string;
  adminId?: string | null;
}): Promise<number> {
  if (input.installerIds.length === 0) return 0;
  const r = await prisma.installerInboxNotice.createMany({
    data: input.installerIds.map((installerId) => ({
      installerId,
      title: input.title,
      body: input.body,
      createdByAdminId: input.adminId ?? null,
    })),
  });
  return r.count;
}
