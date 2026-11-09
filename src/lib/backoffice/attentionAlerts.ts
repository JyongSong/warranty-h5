import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// 설치 업무 큐의 "처리 필요/예외" 탭과 같은 조건. 조건이 바뀌면
// src/lib/installation/orders/views/orders.ts 의 attention 조건도 같이 바꾼다.
export const ATTENTION_INSTALLATION_ORDER_WHERE: Prisma.InstallationOrderWhereInput = {
  OR: [
    { hasOpenIssue: true },
    { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
    { status: "WAITING_ADMIN_REVIEW" },
  ],
};

// 새로 들어온 건을 찾을 때 비교할 id 를 이만큼까지만 돌려준다. 처리 필요 건이
// 이보다 많아지면 오래된 건부터 빠지고, 빠진 건은 다시 들어와도 알림이 한 번 더 울릴 수 있다.
export const ATTENTION_ALERT_ID_LIMIT = 500;

export type AttentionAlertSnapshot = {
  count: number;
  ids: string[];
};

export async function getAttentionAlertSnapshot(): Promise<AttentionAlertSnapshot> {
  const [count, rows] = await Promise.all([
    prisma.installationOrder.count({ where: ATTENTION_INSTALLATION_ORDER_WHERE }),
    prisma.installationOrder.findMany({
      where: ATTENTION_INSTALLATION_ORDER_WHERE,
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: ATTENTION_ALERT_ID_LIMIT,
    }),
  ]);

  return { count, ids: rows.map((row) => row.id) };
}
