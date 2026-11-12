import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_SETTING_KEYS, isSystemSettingEnabled } from "@/lib/backoffice/system-settings";
import {
  PopbillError,
  checkMember,
  getCertRegisterUrl,
  getInvoiceInfo,
  getInvoiceViewUrl,
  isPopbillConfigured,
  isPopbillTest,
  registIssue,
  type MemberCheck,
} from "@/lib/popbill/client";
import {
  computeAmounts,
  flowOf,
  formatYm,
  getHqInvoiceInfo,
  isSettlementLaunched,
  ymBounds,
} from "@/lib/installation/settlement/statements";

/**
 * 기사 앱 전자세금계산서(팝빌 정발행).
 *
 * 준비(기사가 한 번): 팝빌에 우리 LinkID 로 연동회원 가입 → 공동인증서 등록 → 앱 「연동 확인」.
 *   연동 확인은 정산 정보의 사업자번호로 팝빌에 물어 상태를 installer_popbill_links 에 남긴다.
 * 발행(정산서마다): 「전자세금계산서 발행」 → 팝빌 정발행 → 국세청 승인번호를 받으면 증빙 확인 완료(CONFIRMED)로 바로 넘어간다.
 *   사진 제출·본사 확인 단계가 없다. 국세청 승인번호가 곧 증빙이다.
 */

export type PopbillLinkStatus = "NOT_MEMBER" | "NO_CERT" | "CERT_INVALID" | "READY";

export class PopbillTaxInvoiceError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "PopbillTaxInvoiceError";
  }
}

/** 기사 앱에 팝빌 연동·발행을 보여 줄지: 정산 공개 + 팝빌 스위치 + 키 설정 */
export async function isPopbillTaxInvoiceEnabled(): Promise<boolean> {
  if (!isPopbillConfigured()) return false;
  const [launched, enabled] = await Promise.all([
    isSettlementLaunched(),
    isSystemSettingEnabled(SYSTEM_SETTING_KEYS.installerPopbillEnabled),
  ]);
  return launched && enabled;
}

export function popbillSignupUrl(): string {
  return isPopbillTest() ? "https://test.popbill.com" : "https://www.popbill.com";
}

export function popbillLinkId(): string {
  return process.env.POPBILL_LINK_ID ?? "";
}

function statusOf(check: MemberCheck): PopbillLinkStatus {
  if (!check.member) return "NOT_MEMBER";
  if (!check.cert.registered) return "NO_CERT";
  if (!check.cert.valid) return "CERT_INVALID";
  return "READY";
}

export type PopbillLinkView = {
  /** 정산 정보의 사업자번호(숫자만). 정산 정보가 없으면 null */
  businessNumber: string | null;
  businessName: string | null;
  link: {
    corpNum: string;
    status: PopbillLinkStatus;
    userId: string | null;
    certExpiresAt: string | null;
    checkedAt: string;
    /** 확인 후 정산 정보의 사업자번호가 바뀌었으면 true → 다시 확인 필요 */
    stale: boolean;
  } | null;
};

export async function getPopbillLinkView(installerId: string): Promise<PopbillLinkView> {
  const [info, link] = await Promise.all([
    prisma.installerSettlementInfo.findUnique({
      where: { installerId },
      select: { businessNumber: true, businessName: true },
    }),
    prisma.installerPopbillLink.findUnique({ where: { installerId } }),
  ]);
  const businessNumber = info?.businessNumber.replace(/\D/g, "") ?? null;
  return {
    businessNumber,
    businessName: info?.businessName ?? null,
    link: link
      ? {
          corpNum: link.corpNum,
          status: link.status as PopbillLinkStatus,
          userId: link.userId,
          certExpiresAt: link.certExpiresAt?.toISOString() ?? null,
          checkedAt: link.checkedAt.toISOString(),
          stale: businessNumber !== link.corpNum,
        }
      : null,
  };
}

async function requireBusinessNumber(installerId: string): Promise<string> {
  const info = await prisma.installerSettlementInfo.findUnique({
    where: { installerId },
    select: { businessNumber: true },
  });
  const corpNum = info?.businessNumber.replace(/\D/g, "");
  if (!corpNum) throw new PopbillTaxInvoiceError("NO_SETTLEMENT_INFO");
  return corpNum;
}

async function saveLink(installerId: string, corpNum: string, check: MemberCheck) {
  const status = statusOf(check);
  const data = {
    corpNum,
    status,
    userId: check.member ? check.userId : null,
    certExpiresAt: check.member && check.cert.registered ? check.cert.expiresAt : null,
    checkedAt: new Date(),
  };
  await prisma.installerPopbillLink.upsert({
    where: { installerId },
    create: { installerId, ...data },
    update: data,
  });
  return { status, check };
}

/** 앱 「연동 확인」: 팝빌에 가입·인증서 상태를 물어 저장한다. */
export async function verifyPopbillLink(installerId: string) {
  const corpNum = await requireBusinessNumber(installerId);
  const check = await checkMember(corpNum);
  const { status } = await saveLink(installerId, corpNum, check);
  return {
    status,
    invalidReason: check.member && check.cert.registered ? check.cert.invalidReason : null,
  };
}

/** 팝빌 인증서 등록 팝업 URL(30초 유효). 가입이 먼저다. */
export async function getPopbillCertRegisterUrl(installerId: string): Promise<string> {
  const corpNum = await requireBusinessNumber(installerId);
  const check = await checkMember(corpNum);
  await saveLink(installerId, corpNum, check);
  if (!check.member) throw new PopbillTaxInvoiceError("NOT_MEMBER");
  return getCertRegisterUrl(corpNum, check.userId ?? undefined);
}

// ── 발행 ─────────────────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstToday = () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 문서번호: 공급자 사업자번호 안에서 유일, 24자 이내 [A-Za-z0-9-_] */
function newMgtKey(ym: string, seq: number): string {
  return `AQ${ym.replace("-", "")}-${seq}-${Date.now().toString(36).toUpperCase()}`;
}

async function loadIssuable(installerId: string, statementId: string) {
  const row = await prisma.settlementStatement.findUnique({
    where: { id: statementId },
    include: {
      installer: {
        select: {
          settlementInfo: {
            select: {
              taxDocType: true,
              status: true,
              businessNumber: true,
              businessName: true,
              representativeName: true,
              invoiceEmail: true,
            },
          },
        },
      },
    },
  });
  if (!row || row.installerId !== installerId) throw new PopbillTaxInvoiceError("NOT_FOUND");
  const info = row.installer.settlementInfo;
  if (!info || info.status !== "APPROVED") throw new PopbillTaxInvoiceError("SETTLEMENT_INFO_NOT_APPROVED");
  const taxDocType = row.taxDocType ?? info.taxDocType ?? null;
  if (taxDocType !== "E_TAX_INVOICE") throw new PopbillTaxInvoiceError("FLOW_MISMATCH");
  if (row.paidAt) throw new PopbillTaxInvoiceError("ALREADY_PAID");
  if (row.ntsConfirmNum) throw new PopbillTaxInvoiceError("ALREADY_ISSUED");
  if (row.evidenceStatus !== "PENDING" && row.evidenceStatus !== "REJECTED") {
    throw new PopbillTaxInvoiceError("NOT_SUBMITTABLE");
  }
  return { row, info, taxDocType };
}

type Issuable = Awaited<ReturnType<typeof loadIssuable>>;

async function markIssued(s: Issuable, ntsConfirmNum: string | null) {
  const { vatAmount, payAmount } = computeAmounts(s.row.baseAmount, flowOf(s.taxDocType));
  const now = new Date();
  await prisma.settlementStatement.update({
    where: { id: s.row.id },
    data: {
      taxDocType: s.taxDocType,
      vatAmount,
      payAmount,
      evidenceStatus: "CONFIRMED",
      evidencePhotoPaths: [],
      invoiceIssueDate: kstToday(),
      evidenceSubmittedAt: now,
      evidenceRejectReason: null,
      evidenceReviewedAt: now,
      evidenceReviewedBy: "POPBILL",
      ntsConfirmNum,
      popbillIssuedAt: now,
      popbillError: null,
    },
  });
}

/**
 * 팝빌 문서 상태가 발행 완료인지. 1xx 임시저장 · 2xx 승인대기 · 3xx 발행완료 · 4xx 거부 · 5xx 취소 · 6xx 발행취소.
 * 발행취소(6xx)도 300 보다 크므로 범위로 본다.
 */
export function isIssuedState(stateCode: number): boolean {
  return stateCode >= 300 && stateCode < 400;
}

/**
 * 정산서 1장을 팝빌 정발행한다. 성공하면 국세청 승인번호와 함께 증빙 확인 완료로 바뀐다.
 * 실패하면 PopbillTaxInvoiceError(메시지 = 코드, detail = 팝빌 메시지)를 던지고 정산서에 마지막 오류를 남긴다.
 */
export async function issueStatementTaxInvoice(input: { installerId: string; statementId: string }): Promise<{ ntsConfirmNum: string | null }> {
  if (!(await isPopbillTaxInvoiceEnabled())) throw new PopbillTaxInvoiceError("DISABLED");
  const s = await loadIssuable(input.installerId, input.statementId);
  const corpNum = s.info.businessNumber.replace(/\D/g, "");

  const hq = await getHqInvoiceInfo();
  const hqCorpNum = hq.businessNumber?.replace(/\D/g, "") ?? "";
  if (hqCorpNum.length !== 10 || !hq.businessName || !hq.representative) {
    throw new PopbillTaxInvoiceError("HQ_INFO_MISSING");
  }

  // 지난 시도에서 응답을 못 받았으면 그 문서번호로 먼저 확인한다.
  if (s.row.popbillMgtKey && s.row.popbillCorpNum === corpNum) {
    const prev = await getInvoiceInfo(corpNum, s.row.popbillMgtKey);
    if (prev && isIssuedState(prev.stateCode)) {
      await markIssued(s, prev.ntsConfirmNum);
      return { ntsConfirmNum: prev.ntsConfirmNum };
    }
  }

  // 발행 직전에 가입·인증서를 다시 확인한다(만료·삭제 대비).
  const check = await checkMember(corpNum);
  const { status } = await saveLink(input.installerId, corpNum, check);
  if (status !== "READY") throw new PopbillTaxInvoiceError(`LINK_${status}`);

  // 문서번호를 먼저 잡아 둔다. 동시에 두 번 누르면 하나만 통과한다.
  const mgtKey = newMgtKey(s.row.ym, s.row.seq);
  const claimed = await prisma.settlementStatement.updateMany({
    where: { id: s.row.id, ntsConfirmNum: null, popbillMgtKey: s.row.popbillMgtKey },
    data: { popbillMgtKey: mgtKey, popbillCorpNum: corpNum, popbillError: null },
  });
  if (claimed.count !== 1) throw new PopbillTaxInvoiceError("IN_PROGRESS");

  const writeDate = ymBounds(s.row.ym).lastDate.replace(/-/g, "");
  // 사진 제출 화면의 품목 안내와 같은 문구
  const itemName = `설치 용역 (${formatYm(s.row.ym)}${s.row.seq > 1 ? " 추가분" : ""})`;
  const { vatAmount } = computeAmounts(s.row.baseAmount, "TAX");
  const corp = check.member ? check.corp : null;

  try {
    const r = await registIssue({
      mgtKey,
      writeDate,
      supplier: {
        corpNum,
        corpName: s.info.businessName,
        ceoName: s.info.representativeName,
        addr: corp?.addr,
        bizType: corp?.bizType,
        bizClass: corp?.bizClass,
        email: s.info.invoiceEmail,
      },
      buyer: {
        corpNum: hqCorpNum,
        corpName: hq.businessName,
        ceoName: hq.representative,
        addr: hq.address,
        bizType: hq.businessType,
        bizClass: hq.businessItem,
        email: hq.email,
      },
      itemName,
      supplyCost: s.row.baseAmount,
      tax: vatAmount,
      userId: check.member ? check.userId : null,
    });
    await markIssued(s, r.ntsConfirmNum);
    return { ntsConfirmNum: r.ntsConfirmNum };
  } catch (error) {
    const pe = error instanceof PopbillError ? error : null;
    // 시간 초과·알 수 없는 오류는 팝빌에 문서가 생겼을 수 있어 문서번호를 남겨 다음 시도 때 확인한다.
    const uncertain = !pe || pe.code === -2 || pe.code === -3;
    const message = pe ? `[${pe.code}] ${pe.message}` : String(error);
    await prisma.settlementStatement.update({
      where: { id: s.row.id },
      data: { popbillError: message.slice(0, 500), ...(uncertain ? {} : { popbillMgtKey: null, popbillCorpNum: null }) },
    });
    console.error("[popbill/issue]", s.row.id, message);
    throw new PopbillTaxInvoiceError(uncertain ? "UNCERTAIN" : "POPBILL_FAILED", pe?.message);
  }
}

/** 발행된 세금계산서 보기 팝업 URL(기사 본인 정산서만) */
export async function getStatementInvoiceViewUrl(installerId: string, statementId: string): Promise<string> {
  const row = await prisma.settlementStatement.findUnique({
    where: { id: statementId },
    select: { installerId: true, popbillMgtKey: true, popbillCorpNum: true, ntsConfirmNum: true },
  });
  if (!row || row.installerId !== installerId) throw new PopbillTaxInvoiceError("NOT_FOUND");
  if (!row.ntsConfirmNum || !row.popbillMgtKey || !row.popbillCorpNum) throw new PopbillTaxInvoiceError("NOT_ISSUED");
  return getInvoiceViewUrl(row.popbillCorpNum, row.popbillMgtKey);
}
