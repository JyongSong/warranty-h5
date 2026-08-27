import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isKoreanMobileNumber, isSafeVirtualNumber } from "@/lib/phone";
import { encryptNullablePii, hmacPii, normalizePhone11 } from "@/lib/piiCrypto";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import { InstallationCustomerRequestError } from "@/lib/installation/customer/errors";
import {
  isInstallDateWithinDispatchWindow,
  normalizeCustomerRequestSubmitInput,
} from "@/lib/installation/customer/validate";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { dispatchReadyInstallationOrders } from "@/lib/installation/installer/dispatch";
import { consumeVerifiedCustomerPhone } from "@/lib/installation/cj/otp";
import { lookupCjOrderNo, normalizeCjOrderNo } from "@/lib/installation/cj/manifest";

// CJ 채널 제출. 자사 채널과 흐름이 반대라는 점이 핵심이다.
//
//   자사: ERP 주문 → 주문 생성 → 링크 발송 → 고객 입력 → 배정
//   CJ  : 고객 입력 → 그 때 주문 생성 → 배정
//
// 그래서 여기서 소스·주문·고객요청 세 건을 한 트랜잭션에 만들고 곧바로
// READY_FOR_CANDIDATE_SELECTION 으로 둔다. 그 뒤 배정·수락·완공·정산은
// 자사 채널과 완전히 같은 경로를 탄다.

export const CJ_CHANNEL = "CJ";

// CJ 는 K100 단일 모델만 판매한다. 월패드·허브 옵션 여부는 우리에게 오지
// 않으므로 적지 않는다 — 도어락 설치 조건으로만 배정한다(합의 사항).
// 이 문자열은 source-items.ts 의 정규식이 읽어 DOORLOCK 능력을 뽑아낸다.
const CJ_ORDER_MEMO = "스마트 도어락 K100 x1";

export type SubmitCjRequestInput = {
  orderNo: string;
  ordererPhone: string;
  ordererVerifiedToken: string;
  customerPhone: string;
  installAddress: string;
  installAddressDetail?: string | null;
  installDate: string;
  installTimeSlot?: string | null;
  customerNote?: string | null;
  now?: Date;
};

export async function submitCjCustomerRequest(input: SubmitCjRequestInput) {
  const now = input.now ?? new Date();

  const orderNo = normalizeCjOrderNo(input.orderNo);
  const lookup = await lookupCjOrderNo(orderNo);
  if (lookup.status === "NOT_FOUND") {
    throw new InstallationCustomerRequestError("CJ_ORDER_NO_NOT_FOUND");
  }
  if (lookup.status === "ALREADY_USED") {
    throw new InstallationCustomerRequestError("CJ_ORDER_NO_ALREADY_USED");
  }

  if (!input.ordererPhone?.trim()) {
    throw new InstallationCustomerRequestError("ORDERER_PHONE_REQUIRED");
  }

  // normalizePhone11 은 자릿수가 안 맞으면 raw Error 를 던진다. 그대로 두면
  // 고객에게 "일시적인 오류"로 보여 정작 무엇을 고쳐야 하는지 알 수 없다.
  let ordererPhone: string;
  try {
    ordererPhone = normalizePhone11(input.ordererPhone);
  } catch {
    throw new InstallationCustomerRequestError("ORDERER_PHONE_INVALID");
  }

  // 설치 받는 분 번호는 기사가 실제로 거는 번호다. 자사 채널과 같은 규칙을
  // 태우기 위해 공용 검증기에 customerPhone 으로 넣는다.
  const normalized = normalizeCustomerRequestSubmitInput(
    {
      installAddress: input.installAddress,
      installAddressDetail: input.installAddressDetail,
      installDate: input.installDate,
      installTimeSlot: input.installTimeSlot,
      customerPhone: input.customerPhone,
      customerNote: input.customerNote,
    },
    now,
  );

  if (!isKoreanMobileNumber(ordererPhone) || isSafeVirtualNumber(ordererPhone)) {
    throw new InstallationCustomerRequestError("ORDERER_PHONE_INVALID");
  }

  // 인증 확인은 값 검증을 모두 통과한 뒤에 한다. 토큰은 한 번 쓰면 타므로,
  // 주소 오타 같은 사유로 실패했을 때 고객이 재인증하게 만들면 안 된다.
  await consumeVerifiedCustomerPhone(input.ordererVerifiedToken, ordererPhone, now);

  const submitted = await prisma.$transaction(async (tx) => {
    // 명단 소진을 조건부로 잡아 같은 주문번호의 동시 제출을 막는다.
    // 여기서 0건이면 그 사이 다른 요청이 먼저 가져간 것이다.
    const claimed = await tx.cjOrderManifest.updateMany({
      where: { id: lookup.manifestId, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claimed.count === 0) {
      throw new InstallationCustomerRequestError("CJ_ORDER_NO_ALREADY_USED");
    }

    const source = await tx.installationOrderSource.create({
      data: {
        sourceKey: `CJ-${orderNo}`,
        channel: CJ_CHANNEL,
        externalOrderNo: orderNo,
        externalOrderDate: lookup.orderDate,
        memo: CJ_ORDER_MEMO,
        // dueDate 는 백오피스에서 "주문일"로 표시된다(ERP 의 DT_DUEDATE 자리).
        // 설치 희망일이 아니라 CJ 명단에 실린 주문일을 넣어야 한다.
        dueDate: lookup.orderDate?.replace(/-/g, "") ?? null,
        orderNumbers: orderNo,
      },
      select: { id: true },
    });

    const order = await tx.installationOrder.create({
      data: {
        sourceId: source.id,
        // 고객 입력이 이미 끝난 상태로 태어나는 주문이다.
        status: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        statusChangedAt: now,
      },
      select: { id: true },
    });

    const request = await tx.installationCustomerRequest.create({
      data: {
        installationOrderId: order.id,
        requestNumber: 1,
        installAddressEncrypted: encryptNullablePii(normalized.installAddress),
        installAddressDetailEncrypted: encryptNullablePii(normalized.installAddressDetail),
        installAddress1Encrypted: encryptNullablePii(normalized.installAddress1),
        installAddress2Encrypted: encryptNullablePii(normalized.installAddress2),
        installDate: normalized.installDate,
        installTimeSlot: normalized.installTimeSlot,
        customerPhoneEncrypted: encryptNullablePii(normalized.customerPhone),
        customerPhoneHash: hmacPii(normalized.customerPhone),
        customerPhoneSource: "CUSTOMER",
        ordererPhoneEncrypted: encryptNullablePii(ordererPhone),
        ordererPhoneHash: hmacPii(ordererPhone),
        ordererPhoneVerifiedAt: now,
        customerNote: normalized.customerNote,
        customerSubmittedAt: now,
        status: "SUBMITTED",
        // 이 채널은 1:1 링크를 쓰지 않는다. 토큰 칼럼이 NOT NULL/UNIQUE 이라
        // 아무도 알 수 없는 값을 채워 스키마 제약만 만족시킨다.
        customerTokenHash: hashInstallationCustomerToken(
          `cj:${orderNo}:${randomBytes(24).toString("hex")}`,
        ),
        customerTokenExpiresAt: now,
      },
      select: { id: true },
    });

    await tx.installationOrder.update({
      where: { id: order.id },
      data: { activeCustomerRequestId: request.id },
    });

    await tx.cjOrderManifest.update({
      where: { id: lookup.manifestId },
      data: { installationOrderId: order.id },
    });

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: order.id,
        fromStatus: null,
        toStatus: INSTALLATION_ORDER_STATUSES.READY_FOR_CANDIDATE_SELECTION,
        eventType: "CJ_CUSTOMER_SUBMITTED",
        actorType: "CUSTOMER",
        reason: "CJ_CHANNEL_PUBLIC_FORM",
        metadata: {
          customerRequestId: request.id,
          channel: CJ_CHANNEL,
          externalOrderNo: orderNo,
        },
        createdAt: now,
      },
    });

    return { installationOrderId: order.id, customerRequestId: request.id };
  });

  // 자사 채널과 같은 조건으로 즉시 배정을 시도한다. 실패해도 제출 자체는
  // 이미 확정이므로 고객에게 오류를 돌려주지 않는다 — 크론이 다시 집어간다.
  if (isInstallDateWithinDispatchWindow(normalized.installDate, now)) {
    try {
      await dispatchReadyInstallationOrders({
        now,
        limit: 1,
        orderId: submitted.installationOrderId,
      });
    } catch (error) {
      console.error("[cj/submit] dispatch failed", submitted.installationOrderId, error);
    }
  }

  return submitted;
}
