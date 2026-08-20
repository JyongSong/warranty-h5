import { prisma } from "@/lib/prisma";

/**
 * 하단 탭 배지 숫자.
 *
 * "기사가 지금 손을 대야 하는 것"만 센다:
 *   - 응답 대기: 수락/거절해야 하고 24시간 뒤 다음 기사에게 넘어간다
 *   - 반려: 완료 등록이 반려돼 다시 올려야 한다
 *
 * 검수 대기는 세지 않는다 — 기사가 할 일이 없고 본사를 기다리는 상태다.
 *
 * 레이아웃에서 매 화면마다 부르므로 count 네 개로만 끝낸다(행을 읽지 않아
 * PII 복호화도 없다).
 */
export type InstallerTabCounts = {
  install: number;
  as: number;
};

export async function getInstallerTabCounts(installerId: string): Promise<InstallerTabCounts> {
  const [installPending, installRejected, asPending, asRejected] = await Promise.all([
    prisma.installationInstallerAssignmentAttempt.count({
      where: {
        installerId,
        status: "WAITING_INSTALLER_RESPONSE",
        // 주문이 실제로 이 시도를 바라보고 있을 때만 응답 가능하다.
        activeForOrders: { some: { status: "WAITING_INSTALLER_RESPONSE" } },
      },
    }),
    prisma.installationOrder.count({
      where: {
        currentInstallerId: installerId,
        status: "INSTALLER_ASSIGNED",
        completion: { reviewStatus: "REJECTED" },
      },
    }),
    prisma.asOrder.count({
      where: { currentInstallerId: installerId, status: "WAITING_INSTALLER_RESPONSE" },
    }),
    prisma.asOrder.count({
      where: {
        currentInstallerId: installerId,
        status: "INSTALLER_ASSIGNED",
        reviewStatus: "REJECTED",
      },
    }),
  ]);

  return {
    install: installPending + installRejected,
    as: asPending + asRejected,
  };
}
