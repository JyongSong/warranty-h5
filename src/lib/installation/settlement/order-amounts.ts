import { prisma } from "@/lib/prisma";
import { computeInstallLineItems } from "./compute";
import { resolveInstallerRatesBatch } from "./rates";

/**
 * 백오피스 목록에서 "이 건이 얼마짜리인가"를 한눈에 보여주기 위한 금액.
 *
 * 두 가지 상태가 있고, 구분해서 보여줘야 한다:
 *   CONFIRMED — 승인이 끝나 settlement_lines 에 얼어붙은 금액. 확정값.
 *   ESTIMATED — 아직 검수 대기 중이라 승인 시점에 다시 계산될 예상값.
 *
 * 예상값은 승인 로직과 같은 computeInstallLineItems 로 만든다. 공식을 복제하면
 * 검수 화면에서 본 금액과 실제 정산이 어긋난다.
 */
export type OrderAmount = {
  totalAmount: number;
  status: "CONFIRMED" | "ESTIMATED";
};

export async function getInstallOrderAmounts(
  orderIds: string[],
): Promise<Map<string, OrderAmount>> {
  const result = new Map<string, OrderAmount>();
  const ids = [...new Set(orderIds)].filter(Boolean);
  if (ids.length === 0) return result;

  const [lines, completions] = await Promise.all([
    prisma.settlementLine.findMany({
      where: { sourceType: "INSTALL", sourceOrderId: { in: ids } },
      select: { sourceOrderId: true, totalAmount: true },
    }),
    // 검수 대기 건만 미리 계산한다. 승인/반려된 건은 각각 확정값이 있거나
    // 정산 대상이 아니다.
    prisma.installationCompletion.findMany({
      where: { installationOrderId: { in: ids }, reviewStatus: "PENDING" },
      select: {
        installationOrderId: true,
        achievedAqaraAppCapability: true,
        longDistanceAmount: true,
        wallpadAmount: true,
        installEndAt: true,
        installationOrder: { select: { currentInstallerId: true } },
      },
    }),
  ]);

  for (const line of lines) {
    result.set(line.sourceOrderId, { totalAmount: line.totalAmount, status: "CONFIRMED" });
  }

  const pending = completions.filter((c) => c.installationOrder?.currentInstallerId);
  const ratesByInstaller = await resolveInstallerRatesBatch(
    pending.map((c) => c.installationOrder!.currentInstallerId!),
  );

  for (const completion of pending) {
    // 확정값이 이미 있으면 예상값으로 덮지 않는다.
    if (result.has(completion.installationOrderId)) continue;

    const rates = ratesByInstaller.get(completion.installationOrder!.currentInstallerId!);
    if (!rates) continue;

    const { items } = computeInstallLineItems({
      achievedAqaraAppCapability: completion.achievedAqaraAppCapability,
      longDistanceAmount: completion.longDistanceAmount,
      wallpadAmount: completion.wallpadAmount,
      installEndAt: completion.installEndAt,
      rates,
    });

    result.set(completion.installationOrderId, {
      totalAmount: items.totalAmount,
      status: "ESTIMATED",
    });
  }

  return result;
}
