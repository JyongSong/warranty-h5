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

  const completion = await tx.installationCompletion.findUnique({
    where: { installationOrderId: input.orderId },
    select: {
      submittedInstallerId: true,
      achievedAqaraAppCapability: true,
      longDistanceAmount: true,
      wallpadAmount: true,
      installEndAt: true,
    },
  });
  if (!completion) return;

  const { rates, source } = await resolveInstallerRates(completion.submittedInstallerId, tx);
  const { items, breakdown } = computeInstallLineItems({
    achievedAqaraAppCapability: completion.achievedAqaraAppCapability,
    longDistanceAmount: completion.longDistanceAmount,
    wallpadAmount: completion.wallpadAmount,
    installEndAt: completion.installEndAt,
    rates,
  });

  await tx.settlementLine.create({
    data: {
      installerId: completion.submittedInstallerId,
      sourceType: "INSTALL",
      sourceOrderId: input.orderId,
      completedAt: completion.installEndAt,
      approvedByAdminId: input.adminId,
      linkageFee: items.linkageFee,
      travelFee: items.travelFee,
      longDistanceFee: items.longDistanceFee,
      nightWeekendFee: items.nightWeekendFee,
      serviceFee: items.serviceFee,
      wallpadAmount: items.wallpadAmount,
      totalAmount: items.totalAmount,
      rateSource: source as unknown as Prisma.InputJsonValue,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
    },
  });
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
      wallpadAmount: 0,
      totalAmount: items.totalAmount,
      rateSource: { serviceFee: "as-order" } as unknown as Prisma.InputJsonValue,
    },
  });
}
