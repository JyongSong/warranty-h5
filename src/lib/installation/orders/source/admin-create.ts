import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isKoreanMobileNumber, isSafeVirtualNumber } from "@/lib/phone";
import { encryptNullablePii, hmacPii, normalizeNameForHash, normalizePhone11 } from "@/lib/piiCrypto";
import {
  parseInstallationAddress,
  splitInstallationSourceAddress,
} from "@/lib/installation/customer/address-parser";
import { isInstallDateWithinDispatchWindow } from "@/lib/installation/customer/validate";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";
import {
  AdminOrderItemsError,
  buildAdminOrderItemsMemo,
  type AdminOrderItemInput,
} from "@/lib/installation/orders/source/admin-order-items";

// 관리자 직접 입력 주문. ERP·CJ 어디에도 없는 예외 건을 본사가 대신 접수한다.
//
// CJ 채널과 같은 모양이다: 소스·주문·고객요청을 한 트랜잭션에 만들고 곧바로
// READY_FOR_CANDIDATE_SELECTION 으로 둔다(고객 입력 문자는 보내지 않는다).
// 그 뒤 배정·수락·완공·정산은 다른 주문과 같은 경로를 탄다.

export const ADMIN_MANUAL_CHANNEL = "MANUAL";

const CUSTOMER_NAME_MAX = 30;
const NOTE_MAX = 1000;

export class AdminManualOrderError extends Error {}

export type CreateAdminManualOrderInput = {
  adminId: string;
  customerName: string;
  customerPhone: string;
  installAddress: string;
  installAddressDetail?: string | null;
  installDate: string;
  installTimeSlot?: string | null;
  items: AdminOrderItemInput[];
  note?: string | null;
  now?: Date;
};

export function normalizeAdminManualOrderInput(input: CreateAdminManualOrderInput) {
  const customerName = input.customerName.trim().replace(/\s+/g, " ");
  if (!customerName) throw new AdminManualOrderError("CUSTOMER_NAME_REQUIRED");
  if (customerName.length > CUSTOMER_NAME_MAX) throw new AdminManualOrderError("CUSTOMER_NAME_TOO_LONG");

  let customerPhone: string;
  try {
    customerPhone = normalizePhone11(input.customerPhone);
  } catch {
    throw new AdminManualOrderError("CUSTOMER_PHONE_INVALID");
  }
  // 기사가 며칠 뒤 거는 번호라 만료되는 안심번호는 받지 않는다(고객 입력과 같은 기준).
  if (isSafeVirtualNumber(customerPhone)) throw new AdminManualOrderError("CUSTOMER_PHONE_IS_SAFE_NUMBER");
  if (!isKoreanMobileNumber(customerPhone)) throw new AdminManualOrderError("CUSTOMER_PHONE_NOT_MOBILE");

  const installAddress = input.installAddress.trim();
  const installAddressDetail = input.installAddressDetail?.trim() || null;
  if (!installAddress) throw new AdminManualOrderError("INSTALL_ADDRESS_REQUIRED");
  // 지역 매칭이 이 파싱에 기대므로 고객 입력과 같은 기준으로 막는다.
  if (!parseInstallationAddress(installAddress)) throw new AdminManualOrderError("INSTALL_ADDRESS_UNPARSEABLE");
  const split = splitInstallationSourceAddress(installAddress);

  // 관리자 예외 접수라 고객 화면의 날짜 범위·일요일 제한은 두지 않는다(관리자 예약 수정과 같은 기준).
  const installDate = input.installDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate) || Number.isNaN(Date.parse(`${installDate}T00:00:00Z`))) {
    throw new AdminManualOrderError("INSTALL_DATE_INVALID");
  }

  let memo: string;
  try {
    memo = buildAdminOrderItemsMemo(input.items);
  } catch (error) {
    if (error instanceof AdminOrderItemsError) throw new AdminManualOrderError(error.message);
    throw error;
  }

  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX) throw new AdminManualOrderError("NOTE_TOO_LONG");

  return {
    customerName,
    customerPhone,
    installAddress,
    installAddressDetail,
    installAddress1: split?.address1 ?? null,
    installAddress2: split?.address2 ?? null,
    installDate,
    installTimeSlot: input.installTimeSlot?.trim() || null,
    memo,
    note,
  };
}

export async function createAdminManualOrder(input: CreateAdminManualOrderInput) {
  const now = input.now ?? new Date();
  const normalized = normalizeAdminManualOrderInput(input);
  const todayYmd = getKstYmdCompact(now);
  const sourceKey = `MANUAL-${todayYmd}-${randomBytes(4).toString("hex")}`;
  const fullAddress = [normalized.installAddress, normalized.installAddressDetail].filter(Boolean).join(" ");
  const nameHash = hmacPii(normalizeNameForHash(normalized.customerName));
  const phoneHash = hmacPii(normalized.customerPhone);

  const created = await prisma.$transaction(async (tx) => {
    const source = await tx.installationOrderSource.create({
      data: {
        sourceKey,
        channel: ADMIN_MANUAL_CHANNEL,
        customerNameEncrypted: encryptNullablePii(normalized.customerName),
        customerNameHash: nameHash,
        phoneEncrypted: encryptNullablePii(normalized.customerPhone),
        phoneHash,
        addressEncrypted: encryptNullablePii(fullAddress),
        // dueDate 는 백오피스에서 "주문일"로 보인다. 접수한 날을 넣는다.
        dueDate: todayYmd,
        // 목록의 주문번호 칸·검색에 쓰인다. ERP 번호가 없으므로 접수 키를 넣는다.
        orderNumbers: sourceKey,
        memo: normalized.memo,
      },
      select: { id: true },
    });

    const order = await tx.installationOrder.create({
      data: {
        sourceId: source.id,
        status: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        statusChangedAt: now,
      },
      select: { id: true },
    });

    const request = await tx.installationCustomerRequest.create({
      data: {
        installationOrderId: order.id,
        requestNumber: 1,
        customerNameEncrypted: encryptNullablePii(normalized.customerName),
        customerNameHash: nameHash,
        customerPhoneEncrypted: encryptNullablePii(normalized.customerPhone),
        customerPhoneHash: phoneHash,
        customerPhoneSource: "ADMIN",
        installAddressEncrypted: encryptNullablePii(normalized.installAddress),
        installAddressDetailEncrypted: encryptNullablePii(normalized.installAddressDetail),
        installAddress1Encrypted: encryptNullablePii(normalized.installAddress1),
        installAddress2Encrypted: encryptNullablePii(normalized.installAddress2),
        installDate: normalized.installDate,
        installTimeSlot: normalized.installTimeSlot,
        // 기사에게 요청사항으로 보이는 칸이다.
        customerNote: normalized.note,
        customerSubmittedAt: now,
        status: "SUBMITTED",
        // 고객 링크를 쓰지 않는다. 토큰 칼럼이 NOT NULL/UNIQUE 이라 아무도 모르는 값으로 채운다.
        customerTokenHash: hashInstallationCustomerToken(`manual:${sourceKey}:${randomBytes(24).toString("hex")}`),
        customerTokenExpiresAt: now,
      },
      select: { id: true },
    });

    await tx.installationOrder.update({
      where: { id: order.id },
      data: { activeCustomerRequestId: request.id },
    });

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: order.id,
        fromStatus: null,
        toStatus: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        eventType: "ADMIN_MANUAL_CREATED",
        actorType: "ADMIN",
        actorId: input.adminId,
        reason: "ADMIN_MANUAL_ORDER",
        metadata: { customerRequestId: request.id, channel: ADMIN_MANUAL_CHANNEL, sourceKey },
        createdAt: now,
      },
    });

    return { installationOrderId: order.id };
  });

  // 다른 주문과 같은 조건으로 바로 배정을 시도한다. 실패해도 접수는 끝났으므로
  // 오류로 돌려주지 않는다 — 배정 크론이 다시 집어간다.
  if (isInstallDateWithinDispatchWindow(normalized.installDate, now)) {
    try {
      await dispatchReadyInstallationOrders({ now, limit: 1, orderId: created.installationOrderId });
    } catch (error) {
      console.error("[admin-create] dispatch failed", created.installationOrderId, error);
    }
  }

  return created;
}

function getKstYmdCompact(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}
