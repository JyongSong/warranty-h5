import { prisma } from "@/lib/prisma";
import { isKoreanMobileNumber, isSafeVirtualNumber } from "@/lib/phone";
import { decryptNullablePii, encryptNullablePii, hmacPii, normalizePhone11 } from "@/lib/piiCrypto";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";
import { isInstallDateWithinDispatchWindow } from "@/lib/installation/customer/validate";
import {
  INSTALLATION_ORDER_STATUSES,
  transitionInstallationOrderStatus,
} from "@/lib/installation/orders/status";
import { dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";

export class AdminCustomerRequestEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCustomerRequestEditError";
  }
}

/**
 * 관리자가 고객 예약 정보(주소·설치일·시간대·전화번호)를 고칠 수 있는 상태.
 * 기사에게 요청이 나가기 전까지만 허용한다. 기사 응답 대기 이후에는 기사가
 * 이미 받은 내용과 달라지므로 재배정으로 처리한다.
 */
export const ADMIN_EDITABLE_CUSTOMER_REQUEST_STATUSES = [
  INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
  INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW,
] as const;

export function isCustomerRequestEditableByAdmin(status: string) {
  return (ADMIN_EDITABLE_CUSTOMER_REQUEST_STATUSES as readonly string[]).includes(status);
}

export type AdminCustomerRequestEditInput = {
  adminId: string;
  orderId: string;
  /** 도로명/지번 기본 주소 */
  installAddress: string;
  installAddressDetail?: string | null;
  installDate: string;
  installTimeSlot?: string | null;
  customerPhone: string;
  reason: string;
  now?: Date;
};

export type AdminCustomerRequestEditResult = {
  /** 관리자 배정 검토 중이던 후보를 무효로 하고 새로 찾았는지 */
  candidateReselected: boolean;
  status: string;
};

function normalizeInput(input: AdminCustomerRequestEditInput) {
  const installAddress = input.installAddress.trim();
  const installAddressDetail = input.installAddressDetail?.trim() || null;
  const installDate = input.installDate.trim();
  const installTimeSlot = input.installTimeSlot?.trim() || null;
  const reason = input.reason.trim();

  if (!reason) throw new AdminCustomerRequestEditError("EDIT_REASON_REQUIRED");
  if (!installAddress) throw new AdminCustomerRequestEditError("INSTALL_ADDRESS_REQUIRED");
  // 지역 매칭이 이 파싱에 기대므로 고객 입력과 같은 기준으로 막는다.
  if (!parseInstallationAddress(installAddress)) {
    throw new AdminCustomerRequestEditError("INSTALL_ADDRESS_UNPARSEABLE");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate) || Number.isNaN(Date.parse(`${installDate}T00:00:00Z`))) {
    throw new AdminCustomerRequestEditError("INSTALL_DATE_INVALID");
  }

  let customerPhone: string;
  try {
    customerPhone = normalizePhone11(input.customerPhone);
  } catch {
    throw new AdminCustomerRequestEditError("CUSTOMER_PHONE_INVALID");
  }
  // 기사가 며칠 뒤 거는 번호라 만료되는 안심번호는 받지 않는다(고객 입력과 같은 기준).
  if (isSafeVirtualNumber(customerPhone)) {
    throw new AdminCustomerRequestEditError("CUSTOMER_PHONE_IS_SAFE_NUMBER");
  }
  if (!isKoreanMobileNumber(customerPhone)) {
    throw new AdminCustomerRequestEditError("CUSTOMER_PHONE_NOT_MOBILE");
  }

  const split = splitInstallationSourceAddress(installAddress);
  return {
    installAddress,
    installAddressDetail,
    installAddress1: split?.address1 ?? null,
    installAddress2: split?.address2 ?? null,
    installDate,
    installTimeSlot,
    customerPhone,
    reason,
  };
}

export async function updateCustomerRequestByAdmin(
  input: AdminCustomerRequestEditInput,
): Promise<AdminCustomerRequestEditResult> {
  const now = input.now ?? new Date();
  const normalized = normalizeInput(input);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.installationOrder.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        activeCustomerRequestId: true,
        activeAssignmentId: true,
      },
    });
    if (!order) throw new AdminCustomerRequestEditError("ORDER_NOT_FOUND");
    if (!isCustomerRequestEditableByAdmin(order.status)) {
      throw new AdminCustomerRequestEditError("ORDER_NOT_EDITABLE");
    }

    const request = order.activeCustomerRequestId
      ? await tx.installationCustomerRequest.findUnique({
          where: { id: order.activeCustomerRequestId },
        })
      : await tx.installationCustomerRequest.findFirst({
          where: { installationOrderId: order.id, status: { in: ["SUBMITTED", "FALLBACK_USED"] } },
          orderBy: { updatedAt: "desc" },
        });
    if (!request) throw new AdminCustomerRequestEditError("CUSTOMER_REQUEST_NOT_FOUND");

    const before = {
      installAddress: safeDecrypt(request.installAddressEncrypted),
      installAddressDetail: safeDecrypt(request.installAddressDetailEncrypted),
      installDate: request.installDate,
      installTimeSlot: request.installTimeSlot,
      customerPhone: safeDecrypt(request.customerPhoneEncrypted),
    };
    const after = {
      installAddress: normalized.installAddress,
      installAddressDetail: normalized.installAddressDetail,
      installDate: normalized.installDate,
      installTimeSlot: normalized.installTimeSlot,
      customerPhone: normalized.customerPhone,
    };
    const changedFields = (Object.keys(after) as Array<keyof typeof after>).filter(
      (key) => (before[key] ?? null) !== (after[key] ?? null),
    );
    if (changedFields.length === 0) throw new AdminCustomerRequestEditError("NOTHING_CHANGED");

    await tx.installationCustomerRequest.update({
      where: { id: request.id },
      data: {
        installAddressEncrypted: encryptNullablePii(normalized.installAddress),
        installAddressDetailEncrypted: encryptNullablePii(normalized.installAddressDetail),
        installAddress1Encrypted: encryptNullablePii(normalized.installAddress1),
        installAddress2Encrypted: encryptNullablePii(normalized.installAddress2),
        installDate: normalized.installDate,
        installTimeSlot: normalized.installTimeSlot,
        customerPhoneEncrypted: encryptNullablePii(normalized.customerPhone),
        customerPhoneHash: hmacPii(normalized.customerPhone),
        ...(before.customerPhone !== normalized.customerPhone ? { customerPhoneSource: "ADMIN" } : {}),
      },
    });

    // 개인정보는 이력에 평문으로 남기지 않는다. 바뀐 항목 이름과 날짜/시간대만 남긴다.
    const metadata = {
      customerRequestId: request.id,
      changedFields,
      ...(changedFields.includes("installDate")
        ? { installDate: { from: before.installDate, to: after.installDate } }
        : {}),
      ...(changedFields.includes("installTimeSlot")
        ? { installTimeSlot: { from: before.installTimeSlot, to: after.installTimeSlot } }
        : {}),
    };

    // 관리자 배정 검토 중이면 그 후보는 예전 주소/날짜로 뽑은 것이다.
    // 그대로 승인되지 않게 무효로 하고 후보 선정 단계로 돌린다.
    const affectsCandidate = changedFields.some((field) =>
      ["installAddress", "installAddressDetail", "installDate"].includes(field),
    );
    let candidateReselected = false;
    if (order.status === INSTALLATION_ORDER_STATUSES.WAITING_ADMIN_REVIEW && affectsCandidate) {
      if (order.activeAssignmentId) {
        const attempt = await tx.installationInstallerAssignmentAttempt.findUnique({
          where: { id: order.activeAssignmentId },
          select: { id: true, status: true, selectionSnapshot: true },
        });
        if (attempt && attempt.status === "WAITING_ADMIN_REVIEW") {
          await tx.installationInstallerAssignmentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "ADMIN_MANUAL_OVERRIDDEN",
              cancelledByAdminId: input.adminId,
              selectionSnapshot: {
                ...toRecord(attempt.selectionSnapshot),
                manualOverride: {
                  adminId: input.adminId,
                  reason: `예약 정보 수정: ${normalized.reason}`,
                  overriddenAt: now.toISOString(),
                },
              },
            },
          });
        }
      }

      await transitionInstallationOrderStatus(
        order.id,
        INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        {
          now,
          orderData: { activeAssignmentId: null },
          event: {
            eventType: "ADMIN_EDITED_CUSTOMER_REQUEST",
            actorType: "ADMIN",
            actorId: input.adminId,
            reason: normalized.reason,
            metadata: { ...metadata, candidateReselected: true },
          },
        },
        tx as never,
      );
      candidateReselected = true;
    } else {
      // 상태는 그대로 두고 이력만 남긴다(statusChangedAt 을 건드리지 않기 위해 직접 기록).
      await tx.installationOrderStatusEvent.create({
        data: {
          installationOrderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          eventType: "ADMIN_EDITED_CUSTOMER_REQUEST",
          actorType: "ADMIN",
          actorId: input.adminId,
          reason: normalized.reason,
          metadata,
          createdAt: now,
        },
      });
    }

    const nextStatus = candidateReselected
      ? INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION
      : order.status;
    return { candidateReselected, status: nextStatus };
  });

  // 후보 선정 단계에 있고 설치일이 배정 기간 안이면 고객 제출 때처럼 바로 후보를 찾는다.
  // 기간 밖이면 정기 배정이 때가 되면 처리한다.
  if (
    result.status === INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION &&
    isInstallDateWithinDispatchWindow(normalized.installDate, now)
  ) {
    try {
      await dispatchReadyInstallationOrders({ now, limit: 1, orderId: input.orderId });
    } catch (error) {
      console.error("[admin-edit/customer-request/dispatch]", error);
    }
  }

  const latest = await prisma.installationOrder.findUnique({
    where: { id: input.orderId },
    select: { status: true },
  });
  return { candidateReselected: result.candidateReselected, status: latest?.status ?? result.status };
}

function safeDecrypt(value: string | null | undefined) {
  try {
    return decryptNullablePii(value);
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
