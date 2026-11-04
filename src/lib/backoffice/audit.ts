import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BackofficeAuditActor = {
  id: string;
  email: string;
  name?: string | null;
};

export type BackofficeAuditEntityType =
  | "installer"
  | "iot_pass"
  | "backoffice_user"
  | "system_setting"
  | "sms_template";

export type BackofficeAuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "reset_password";

export const BACKOFFICE_AUDIT_ENTITY_LABEL: Record<BackofficeAuditEntityType, string> = {
  installer: "기사",
  iot_pass: "IoT Pass",
  backoffice_user: "백오피스 유저",
  system_setting: "시스템 설정",
  sms_template: "SMS 템플릿",
};

export const BACKOFFICE_AUDIT_ACTION_LABEL: Record<BackofficeAuditAction, string> = {
  create: "추가",
  update: "수정",
  delete: "삭제",
  approve: "가입 승인",
  reject: "가입 거절",
  reset_password: "비밀번호 재설정",
};

// requireAdminApi 가 돌려주는 admin 을 이력용 actor 로 바꾼다.
export function toBackofficeAuditActor(admin: {
  id: string;
  name: string;
  email?: string;
  displayName?: string | null;
}): BackofficeAuditActor {
  return { id: admin.id, email: admin.email ?? admin.name, name: admin.displayName ?? null };
}

export function formatBackofficeActor(actor: { email: string; name?: string | null }) {
  const name = actor.name?.trim();
  return name ? `${name} (${actor.email})` : actor.email;
}

// 비밀번호·암호화 값 같은 건 이력에 남기지 않는다.
const REDACTED_KEYS = new Set([
  "password",
  "emailEncrypted",
  "emailHash",
  "phoneEncrypted",
  "phoneHash",
  "supabaseUserId",
]);

function toAuditJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const json = JSON.parse(
    JSON.stringify(value, (key, inner) => (REDACTED_KEYS.has(key) ? undefined : inner)),
  );
  return json as Prisma.InputJsonValue;
}

// 수정일 때는 실제로 바뀐 필드만 남겨 이력을 읽기 쉽게 한다.
export function pickChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
) {
  if (!before || !after) return { before: before ?? null, after: after ?? null };
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "updatedAt" || key === "updated_at") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
}

// 이력 기록이 실패했다고 이미 끝난 변경을 되돌리지는 않는다. 로그만 남긴다.
export async function recordBackofficeAudit(input: {
  actor: BackofficeAuditActor;
  entityType: BackofficeAuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  action: BackofficeAuditAction;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const diff =
      input.action === "update" &&
      input.before &&
      input.after &&
      typeof input.before === "object" &&
      typeof input.after === "object"
        ? pickChangedFields(
            input.before as Record<string, unknown>,
            input.after as Record<string, unknown>,
          )
        : { before: input.before, after: input.after };

    await prisma.backofficeAuditLog.create({
      data: {
        actorId: input.actor.id,
        actorLabel: formatBackofficeActor(input.actor),
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        action: input.action,
        before: toAuditJson(diff.before),
        after: toAuditJson(diff.after),
      },
    });
  } catch (error) {
    console.error("[backoffice/audit]", error);
  }
}
