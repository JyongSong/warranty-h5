import type { DispatchRow } from "@/lib/dispatch";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { formatKrPhone } from "@/lib/phone";
import { INSTALLATION_ORDER_STATUSES } from "@/lib/installation/orders/status";
import { CJ_CHANNEL } from "@/lib/installation/cj/submit";

// CJ 온스타일 건을 기사배정 엑셀(ERP 건과 같은 양식)로 내보내기 위한 행 변환.
// CJ 건은 ERP 에 없으므로 fetchDispatchRows 가 못 가져온다. 고객이 /i/cj 에서
// 제출한 값으로 같은 DispatchRow 를 만들어 assignDispatch(지점·품목 자동 분배)
// 에 그대로 태운다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type CjDispatchSource = {
  externalOrderNo: string | null;
  submittedAt: Date;
  installAddress: string | null;
  installAddressDetail: string | null;
  installDate: string | null;
  installTimeSlot: string | null;
  customerPhone: string | null;
  ordererPhone: string | null;
  customerNote: string | null;
};

/** Date → KST 기준 YYYYMMDD */
export function toKstYmd(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

/** KST 날짜 범위(YYYYMMDD, 양끝 포함) → UTC [gte, lt) */
export function kstRangeToUtc(fromYmd: string, toYmd: string) {
  const toUtc = (ymd: string) =>
    new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) - KST_OFFSET_MS);
  const gte = toUtc(fromYmd);
  const lt = new Date(toUtc(toYmd).getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

export function toCjDispatchRow(source: CjDispatchSource): DispatchRow {
  const address = [source.installAddress, source.installAddressDetail]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  const schedule = [source.installDate, source.installTimeSlot].filter(Boolean).join(" ");

  // determineItem 은 memo 에서 K100/L100 을 찾아 품목을 정한다. CJ 는 K100 만
  // 팔므로 품목 문구를 고정으로 넣고, 고객 요청사항에 섞인 "L100" 같은 글자가
  // 품목 판별을 뒤집지 않도록 요청사항 쪽은 소문자로 바꿔 둔다.
  const note = source.customerNote?.trim().replace(/[KLU]100/g, (match) => match.toLowerCase());

  const memo = [
    "[CJ 온스타일] 스마트 도어락 K100 x1",
    schedule ? `희망 ${schedule}` : null,
    source.ordererPhone ? `주문자 ${formatKrPhone(source.ordererPhone)}` : null,
    note ? `요청 ${note}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    // CJ 페이지는 고객명을 받지 않는다.
    customer_name: null,
    phone: source.customerPhone ? formatKrPhone(source.customerPhone) : null,
    address: address || null,
    order_numbers: source.externalOrderNo,
    no_girl: null,
    // 엑셀 A열(출고일) 자리. CJ 건은 납기일이 없어 고객 접수일을 쓴다.
    due_date: toKstYmd(source.submittedAt),
    memo,
  };
}

/**
 * 고객 접수일(KST) 범위로 CJ 건을 가져온다. 취소 건은 뺀다.
 * @param fromYmd YYYYMMDD (포함)
 * @param toYmd   YYYYMMDD (포함)
 */
export async function fetchCjDispatchRows(fromYmd: string, toYmd: string): Promise<DispatchRow[]> {
  const range = kstRangeToUtc(fromYmd, toYmd);

  const orders = await prisma.installationOrder.findMany({
    where: {
      source: { channel: CJ_CHANNEL },
      status: { not: INSTALLATION_ORDER_STATUSES.CANCELLED },
      activeCustomerRequest: { customerSubmittedAt: range },
    },
    select: {
      source: { select: { externalOrderNo: true } },
      activeCustomerRequest: {
        select: {
          customerSubmittedAt: true,
          installAddressEncrypted: true,
          installAddressDetailEncrypted: true,
          installDate: true,
          installTimeSlot: true,
          customerPhoneEncrypted: true,
          ordererPhoneEncrypted: true,
          customerNote: true,
        },
      },
    },
  });

  return orders
    .flatMap((order) => {
      const request = order.activeCustomerRequest;
      if (!request?.customerSubmittedAt) return [];
      return [
        {
          externalOrderNo: order.source?.externalOrderNo ?? null,
          submittedAt: request.customerSubmittedAt,
          installAddress: decryptNullablePii(request.installAddressEncrypted),
          installAddressDetail: decryptNullablePii(request.installAddressDetailEncrypted),
          installDate: request.installDate,
          installTimeSlot: request.installTimeSlot,
          customerPhone: decryptNullablePii(request.customerPhoneEncrypted),
          ordererPhone: decryptNullablePii(request.ordererPhoneEncrypted),
          customerNote: request.customerNote,
        },
      ];
    })
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .map(toCjDispatchRow);
}
