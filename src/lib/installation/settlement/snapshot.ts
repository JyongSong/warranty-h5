import type { Prisma } from "@prisma/client";
import { resolveInstallerRates } from "./rates";
import { computeAsLineItems, computeInstallLineItems } from "./compute";

type Tx = Prisma.TransactionClient;

// Freeze a settlement snapshot for an approved INSTALL completion (§8.5 M1).
// Called INSIDE approveInstallerCompletion's transaction. Idempotent: the
// unique (source_type, source_order_id) skips a re-run.
export async function createInstallSettlementSnapshot(
  tx: Tx,
  input: { orderId: string; adminId: string },
): Promise<void> {
  const existing = await tx.settlementLine.findUnique({
    where: { sourceType_sourceOrderId: { sourceType: "INSTALL", sourceOrderId: input.orderId } },
    select: { id: true },
  });
  if (existing) return;

  const data = await computeInstallSnapshotData(tx, input.orderId);
  if (!data) return;

  await tx.settlementLine.create({
    data: {
      ...data,
      sourceType: "INSTALL",
      sourceOrderId: input.orderId,
      approvedByAdminId: input.adminId,
    },
  });
}

export class SettlementSnapshotLockedError extends Error {
  constructor() {
    super("SETTLEMENT_PERIOD_NOT_OPEN");
    this.name = "SettlementSnapshotLockedError";
  }
}

async function findLockableInstallLine(tx: Tx, orderId: string) {
  const line = await tx.settlementLine.findUnique({
    where: { sourceType_sourceOrderId: { sourceType: "INSTALL", sourceOrderId: orderId } },
    select: { id: true, periodId: true, period: { select: { status: true } } },
  });
  // 정산이 끝난(OPEN 이 아닌) 기간에 들어간 건은 금액이 이미 지급/확정된 것이라 건드리지 않는다.
  if (line?.period && line.period.status !== "OPEN") throw new SettlementSnapshotLockedError();
  return line;
}

// 승인된 설치 완료 내용을 관리자가 고친 뒤 금액을 다시 확정한다.
// 이미 열린 정산 기간에 들어가 있으면 그 기간에 그대로 둔다.
export async function rebuildInstallSettlementSnapshot(
  tx: Tx,
  input: { orderId: string; adminId: string },
): Promise<void> {
  const line = await findLockableInstallLine(tx, input.orderId);
  const data = await computeInstallSnapshotData(tx, input.orderId);
  if (!data) return;

  if (line) {
    await tx.settlementLine.update({
      where: { id: line.id },
      data: { ...data, approvedByAdminId: input.adminId },
    });
    return;
  }

  await tx.settlementLine.create({
    data: {
      ...data,
      sourceType: "INSTALL",
      sourceOrderId: input.orderId,
      approvedByAdminId: input.adminId,
    },
  });
}

// 완료 승인을 되돌릴 때 확정했던 정산 금액을 지운다.
// 지우지 않으면 재승인 때 createInstallSettlementSnapshot 이 예전 금액을 그대로 둔다.
export async function removeInstallSettlementSnapshot(tx: Tx, orderId: string): Promise<void> {
  const line = await findLockableInstallLine(tx, orderId);
  if (!line) return;
  await tx.settlementLine.delete({ where: { id: line.id } });
}

async function computeInstallSnapshotData(tx: Tx, orderId: string) {
  const completion = await tx.installationCompletion.findUnique({
    where: { installationOrderId: orderId },
    select: {
      submittedInstallerId: true,
      achievedAqaraAppCapability: true,
      longDistanceAmount: true,
      extraClaimAmount: true,
      wallpadAmount: true,
      wallpadBilling: true,
      agentProxyBaseFee: true,
      installEndAt: true,
      createdAt: true,
    },
  });
  if (!completion) return null;
  const agentProxy = completion.agentProxyBaseFee !== null;

  const { rates, source } = await resolveInstallerRates(completion.submittedInstallerId, tx);
  const { items, breakdown } = computeInstallLineItems({
    achievedAqaraAppCapability: completion.achievedAqaraAppCapability,
    longDistanceAmount: completion.longDistanceAmount,
    extraClaimAmount: completion.extraClaimAmount,
    wallpadAmount: completion.wallpadAmount,
    wallpadBilling: completion.wallpadBilling,
    installEndAt: completion.installEndAt,
    firstSubmittedAt: completion.createdAt,
    rates,
    agentProxyBaseFee: completion.agentProxyBaseFee,
  });

  return {
    installerId: completion.submittedInstallerId,
    completedAt: completion.installEndAt,
    linkageFee: items.linkageFee,
    travelFee: items.travelFee,
    longDistanceFee: items.longDistanceFee,
    nightWeekendFee: items.nightWeekendFee,
    serviceFee: items.serviceFee,
    extraClaimFee: items.extraClaimFee,
    wallpadFee: items.wallpadFee,
    wallpadAmount: items.wallpadAmount,
    totalAmount: items.totalAmount,
    // 대행 건은 기사 단가를 쓰지 않는다. 출장비는 승인된 대행 기본 출장비다.
    rateSource: (agentProxy ? { travelFee: "agent-proxy" } : source) as unknown as Prisma.InputJsonValue,
    breakdown: breakdown as unknown as Prisma.InputJsonValue,
  };
}

// Freeze a settlement snapshot for an approved A/S order (용역비).
// Called INSIDE approveAsCompletion's transaction.
export async function createAsSettlementSnapshot(
  tx: Tx,
  input: { asOrderId: string; adminId: string },
): Promise<void> {
  const existing = await tx.settlementLine.findUnique({
    where: { sourceType_sourceOrderId: { sourceType: "AS", sourceOrderId: input.asOrderId } },
    select: { id: true },
  });
  if (existing) return;

  const order = await tx.asOrder.findUnique({
    where: { id: input.asOrderId },
    select: { currentInstallerId: true, serviceFee: true, submittedAt: true },
  });
  if (!order || !order.currentInstallerId) return;

  const items = computeAsLineItems(order.serviceFee);

  await tx.settlementLine.create({
    data: {
      installerId: order.currentInstallerId,
      sourceType: "AS",
      sourceOrderId: input.asOrderId,
      completedAt: order.submittedAt ?? new Date(),
      approvedByAdminId: input.adminId,
      linkageFee: 0,
      travelFee: 0,
      longDistanceFee: 0,
      nightWeekendFee: 0,
      serviceFee: items.serviceFee,
      extraClaimFee: items.extraClaimFee,
      wallpadFee: 0,
      wallpadAmount: 0,
      totalAmount: items.totalAmount,
      rateSource: { serviceFee: "as-order" } as unknown as Prisma.InputJsonValue,
    },
  });
}
