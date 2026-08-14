import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

// A YYYY-MM-DD (KST) string → the UTC instant boundaries covering that KST day.
// endDate is inclusive, so the upper bound is the start of the next KST day.
function kstDateToUtcStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - KST_OFFSET_MS);
}
function kstDateToUtcEndExclusive(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - KST_OFFSET_MS);
}
function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export type SettlementPeriodView = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: string; // OPEN | SETTLED
  settledAt: string | null;
  lineCount: number;
  totalAmount: number;
};

function toDateStr(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Periods ────────────────────────────────────────────────────────────
export async function createSettlementPeriod(input: {
  adminId: string;
  name: string;
  startDate: string;
  endDate: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new SettlementError("PERIOD_NAME_REQUIRED");
  if (!isValidDateStr(input.startDate) || !isValidDateStr(input.endDate)) {
    throw new SettlementError("PERIOD_DATE_INVALID");
  }
  if (input.startDate > input.endDate) throw new SettlementError("PERIOD_RANGE_INVALID");

  const created = await prisma.settlementPeriod.create({
    data: {
      name,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      status: "OPEN",
      createdByAdminId: input.adminId,
    },
    select: { id: true },
  });
  return created.id;
}

export async function listSettlementPeriods(): Promise<SettlementPeriodView[]> {
  const periods = await prisma.settlementPeriod.findMany({
    orderBy: { startDate: "desc" },
    include: {
      lines: { select: { totalAmount: true } },
    },
  });
  return periods.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate.toISOString().slice(0, 10),
    endDate: p.endDate.toISOString().slice(0, 10),
    status: p.status,
    settledAt: p.settledAt?.toISOString() ?? null,
    lineCount: p.lines.length,
    totalAmount: p.lines.reduce((sum, l) => sum + l.totalAmount, 0),
  }));
}

// Pull every not-yet-assigned settlement line whose completedAt falls in the
// period's KST date range into the period. Only allowed while OPEN.
export async function collectLinesIntoPeriod(periodId: string): Promise<number> {
  const period = await prisma.settlementPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new SettlementError("PERIOD_NOT_FOUND");
  if (period.status !== "OPEN") throw new SettlementError("PERIOD_NOT_OPEN");

  const startStr = period.startDate.toISOString().slice(0, 10);
  const endStr = period.endDate.toISOString().slice(0, 10);

  const result = await prisma.settlementLine.updateMany({
    where: {
      periodId: null,
      completedAt: {
        gte: kstDateToUtcStart(startStr),
        lt: kstDateToUtcEndExclusive(endStr),
      },
    },
    data: { periodId },
  });
  return result.count;
}

export async function removeLineFromPeriod(lineId: string): Promise<void> {
  const line = await prisma.settlementLine.findUnique({
    where: { id: lineId },
    include: { period: { select: { status: true } } },
  });
  if (!line) throw new SettlementError("LINE_NOT_FOUND");
  if (line.period && line.period.status !== "OPEN") throw new SettlementError("PERIOD_NOT_OPEN");
  await prisma.settlementLine.update({ where: { id: lineId }, data: { periodId: null } });
}

export async function setPeriodSettled(input: {
  adminId: string;
  periodId: string;
  settled: boolean;
}): Promise<void> {
  const period = await prisma.settlementPeriod.findUnique({ where: { id: input.periodId } });
  if (!period) throw new SettlementError("PERIOD_NOT_FOUND");
  await prisma.settlementPeriod.update({
    where: { id: input.periodId },
    data: input.settled
      ? { status: "SETTLED", settledAt: new Date(), settledByAdminId: input.adminId }
      : { status: "OPEN", settledAt: null, settledByAdminId: null },
  });
}

// ── Lines ──────────────────────────────────────────────────────────────
export type SettlementLineView = {
  id: string;
  installerId: string;
  installerName: string;
  sourceType: string; // INSTALL | AS
  sourceOrderId: string;
  completedAt: string;
  linkageFee: number;
  travelFee: number;
  longDistanceFee: number;
  nightWeekendFee: number;
  serviceFee: number;
  wallpadAmount: number;
  totalAmount: number;
  periodId: string | null;
};

export type SettlementLineFilter = {
  periodId?: string; // "__none__" for unassigned
  installerId?: string;
  startDate?: string; // YYYY-MM-DD KST
  endDate?: string;
};

function buildLineWhere(filter: SettlementLineFilter): Prisma.SettlementLineWhereInput {
  const where: Prisma.SettlementLineWhereInput = {};
  if (filter.periodId === "__none__") where.periodId = null;
  else if (filter.periodId) where.periodId = filter.periodId;
  if (filter.installerId) where.installerId = filter.installerId;
  if (filter.startDate && isValidDateStr(filter.startDate)) {
    where.completedAt = { ...(where.completedAt as object), gte: kstDateToUtcStart(filter.startDate) };
  }
  if (filter.endDate && isValidDateStr(filter.endDate)) {
    where.completedAt = {
      ...(where.completedAt as object),
      lt: kstDateToUtcEndExclusive(filter.endDate),
    };
  }
  return where;
}

export async function listSettlementLines(
  filter: SettlementLineFilter = {},
): Promise<SettlementLineView[]> {
  const lines = await prisma.settlementLine.findMany({
    where: buildLineWhere(filter),
    orderBy: { completedAt: "desc" },
    include: { installer: { select: { name: true } } },
  });
  return lines.map((l) => ({
    id: l.id,
    installerId: l.installerId,
    installerName: l.installer.name,
    sourceType: l.sourceType,
    sourceOrderId: l.sourceOrderId,
    completedAt: l.completedAt.toISOString(),
    linkageFee: l.linkageFee,
    travelFee: l.travelFee,
    longDistanceFee: l.longDistanceFee,
    nightWeekendFee: l.nightWeekendFee,
    serviceFee: l.serviceFee,
    wallpadAmount: l.wallpadAmount,
    totalAmount: l.totalAmount,
    periodId: l.periodId,
  }));
}

export type InstallerSettlementSummary = {
  installerId: string;
  installerName: string;
  installCount: number;
  asCount: number;
  linkageFee: number;
  travelFee: number;
  longDistanceFee: number;
  nightWeekendFee: number;
  serviceFee: number;
  totalAmount: number;
};

// Aggregate lines by installer for the given filter (period or date range).
export async function aggregateSettlementByInstaller(
  filter: SettlementLineFilter = {},
): Promise<InstallerSettlementSummary[]> {
  const lines = await listSettlementLines(filter);
  const byInstaller = new Map<string, InstallerSettlementSummary>();
  for (const l of lines) {
    let row = byInstaller.get(l.installerId);
    if (!row) {
      row = {
        installerId: l.installerId,
        installerName: l.installerName,
        installCount: 0,
        asCount: 0,
        linkageFee: 0,
        travelFee: 0,
        longDistanceFee: 0,
        nightWeekendFee: 0,
        serviceFee: 0,
        totalAmount: 0,
      };
      byInstaller.set(l.installerId, row);
    }
    if (l.sourceType === "AS") row.asCount += 1;
    else row.installCount += 1;
    row.linkageFee += l.linkageFee;
    row.travelFee += l.travelFee;
    row.longDistanceFee += l.longDistanceFee;
    row.nightWeekendFee += l.nightWeekendFee;
    row.serviceFee += l.serviceFee;
    row.totalAmount += l.totalAmount;
  }
  return [...byInstaller.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

// Installer-facing: only their own lines (§m4 isolation).
export async function listInstallerOwnSettlementLines(
  installerId: string,
  filter: { startDate?: string; endDate?: string } = {},
): Promise<SettlementLineView[]> {
  return listSettlementLines({ ...filter, installerId });
}

export { toDateStr };
