import { prisma } from "@/lib/prisma";
import {
  BACKOFFICE_AUDIT_ENTITY_LABEL,
  type BackofficeAuditEntityType,
} from "@/lib/backoffice/audit";

export const AUDIT_LOG_PAGE_SIZE = 100;

export function isBackofficeAuditEntityType(value: string | undefined): value is BackofficeAuditEntityType {
  return Boolean(value && value in BACKOFFICE_AUDIT_ENTITY_LABEL);
}

export async function listBackofficeAuditLogs(input: {
  entityType?: BackofficeAuditEntityType;
  page: number;
}) {
  const where = input.entityType ? { entityType: input.entityType } : {};
  const [total, rows] = await Promise.all([
    prisma.backofficeAuditLog.count({ where }),
    prisma.backofficeAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
    }),
  ]);
  return { total, rows };
}

// before/after JSON 을 "필드: 이전 → 이후" 줄로 풀어 보여 준다.
export function describeAuditChange(before: unknown, after: unknown): string[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map((key) => {
    const hasBefore = key in b;
    const hasAfter = key in a;
    if (hasBefore && hasAfter) return `${key}: ${formatValue(b[key])} → ${formatValue(a[key])}`;
    if (hasAfter) return `${key}: ${formatValue(a[key])}`;
    return `${key}: ${formatValue(b[key])}`;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(없음)";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(없음)";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
