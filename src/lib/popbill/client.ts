import "server-only";

// 팝빌 SDK 는 타입이 없는 CommonJS(콜백 방식)라 필요한 메서드만 Promise 로 감싼다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const popbill = require("popbill") as PopbillModule;

/**
 * 팝빌 전자세금계산서 연동.
 * - 본사(LinkID AQARALIFE)가 파트너. 기사는 팝빌 사이트에서 우리 LinkID 로 연동회원 가입 + 공동인증서 등록을 직접 한다.
 * - 발행은 정발행: 기사(공급자) → 본사(공급받는자). 수수료는 파트너 포인트에서 빠진다(파트너 결제).
 * - 환경 변수: POPBILL_LINK_ID, POPBILL_SECRET_KEY, POPBILL_IS_TEST(true 면 test.popbill.com).
 *   테스트와 운영은 회원·인증서가 따로라 기사는 운영 전환 때 www.popbill.com 에서 다시 가입해야 한다.
 */

type Callback<T> = (result: T) => void;
type ErrorCallback = (error: { code: number; message: string }) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => void;
type PopbillModule = {
  config: (cfg: Record<string, unknown>) => void;
  TaxinvoiceService: () => Record<string, AnyFn>;
  MgtKeyType: { SELL: string; BUY: string; TRUSTEE: string };
};

export class PopbillError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly method: string,
  ) {
    super(message);
    this.name = "PopbillError";
  }
}

let configured = false;

export function isPopbillConfigured(): boolean {
  return Boolean(process.env.POPBILL_LINK_ID && process.env.POPBILL_SECRET_KEY);
}

export function isPopbillTest(): boolean {
  return process.env.POPBILL_IS_TEST === "true";
}

function service() {
  if (!configured) {
    if (!isPopbillConfigured()) throw new PopbillError(-1, "POPBILL_NOT_CONFIGURED", "config");
    popbill.config({
      LinkID: process.env.POPBILL_LINK_ID,
      SecretKey: process.env.POPBILL_SECRET_KEY,
      IsTest: isPopbillTest(),
      IPRestrictOnOff: true,
      UseStaticIP: false,
      UseLocalTimeYN: true,
    });
    configured = true;
  }
  return popbill.TaxinvoiceService();
}

const TIMEOUT_MS = 20_000;

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PopbillError(-2, "TIMEOUT", method)), TIMEOUT_MS);
    const ok: Callback<T> = (r) => {
      clearTimeout(timer);
      resolve(r);
    };
    const fail: ErrorCallback = (e) => {
      clearTimeout(timer);
      reject(new PopbillError(e?.code ?? -3, e?.message ?? "UNKNOWN", method));
    };
    try {
      service()[method](...args, ok, fail);
    } catch (error) {
      clearTimeout(timer);
      reject(error instanceof PopbillError ? error : new PopbillError(-3, String(error), method));
    }
  });
}

const digits = (corpNum: string) => corpNum.replace(/\D/g, "");

// ── 회원 · 인증서 ─────────────────────────────────────────────────────────

/** 우리 LinkID 아래 연동회원인지 */
export async function isMember(corpNum: string): Promise<boolean> {
  const r = await call<{ code: number }>("checkIsMember", digits(corpNum));
  return r.code === 1;
}

export type PopbillContact = { id: string; personName: string; mgrYN: boolean; state: number };

export async function listContacts(corpNum: string): Promise<PopbillContact[]> {
  return call<PopbillContact[]>("listContact", digits(corpNum));
}

export type PopbillCorpInfo = { ceoname: string; corpName: string; addr: string; bizType: string; bizClass: string };

export async function getCorpInfo(corpNum: string): Promise<PopbillCorpInfo> {
  return call<PopbillCorpInfo>("getCorpInfo", digits(corpNum));
}

export type CertStatus =
  | { registered: false }
  | { registered: true; valid: boolean; expiresAt: Date | null; subject: string | null; invalidReason: string | null };

/** 등록된 공동인증서와 유효성. 미등록은 -10002009 등으로 오류가 나서 registered:false 로 돌려준다. */
export async function getCertStatus(corpNum: string): Promise<CertStatus> {
  let info: { expireDT?: string; subjectDN?: string };
  try {
    info = await call("getTaxCertInfo", digits(corpNum));
  } catch (error) {
    if (error instanceof PopbillError && error.code !== -2 && error.code !== -3 && error.code !== -1) {
      return { registered: false };
    }
    throw error;
  }
  let valid = true;
  let invalidReason: string | null = null;
  try {
    await call("checkCertValidation", digits(corpNum));
  } catch (error) {
    if (!(error instanceof PopbillError) || error.code === -2 || error.code === -3) throw error;
    valid = false;
    invalidReason = error.message;
  }
  return { registered: true, valid, expiresAt: parseKstDateTime(info.expireDT), subject: info.subjectDN ?? null, invalidReason };
}

/** 팝빌 인증서 등록 팝업 URL. 30초 안에 열어야 한다. */
export async function getCertRegisterUrl(corpNum: string, userId?: string): Promise<string> {
  return call<string>("getTaxCertURL", digits(corpNum), userId ?? "");
}

/** 팝빌 연동 상태 한 번에 확인 */
export type MemberCheck =
  | { member: false }
  | { member: true; userId: string | null; corp: PopbillCorpInfo | null; cert: CertStatus };

export async function checkMember(corpNum: string): Promise<MemberCheck> {
  if (!(await isMember(corpNum))) return { member: false };
  const [contacts, corp, cert] = await Promise.all([
    listContacts(corpNum).catch(() => [] as PopbillContact[]),
    getCorpInfo(corpNum).catch(() => null),
    getCertStatus(corpNum),
  ]);
  const admin = contacts.find((c) => c.mgrYN) ?? contacts[0];
  return { member: true, userId: admin?.id ?? null, corp, cert };
}

// ── 정발행 ───────────────────────────────────────────────────────────────

export type IssueInput = {
  mgtKey: string;
  writeDate: string; // yyyyMMdd
  supplier: { corpNum: string; corpName: string; ceoName: string; addr?: string; bizType?: string; bizClass?: string; email?: string | null };
  buyer: { corpNum: string; corpName: string; ceoName: string; addr?: string | null; bizType?: string | null; bizClass?: string | null; email?: string | null };
  itemName: string;
  supplyCost: number;
  tax: number;
  remark?: string;
  userId?: string | null;
};

export type IssueResult = { ntsConfirmNum: string | null; issueDT: string | null };

/** 정발행(즉시 발행). 성공하면 국세청 승인번호가 바로 나온다(국세청 전송은 다음 날 오후 3시). */
export async function registIssue(input: IssueInput): Promise<IssueResult> {
  const s = input.supplier;
  const b = input.buyer;
  const total = input.supplyCost + input.tax;
  const taxinvoice = {
    issueType: "정발행",
    taxType: "과세",
    chargeDirection: "정과금",
    purposeType: "청구",
    writeDate: input.writeDate,
    supplyCostTotal: String(input.supplyCost),
    taxTotal: String(input.tax),
    totalAmount: String(total),
    remark1: input.remark ?? "",
    invoicerMgtKey: input.mgtKey,
    invoicerCorpNum: digits(s.corpNum),
    invoicerCorpName: s.corpName,
    invoicerCEOName: s.ceoName,
    invoicerAddr: s.addr ?? "",
    invoicerBizType: s.bizType ?? "",
    invoicerBizClass: s.bizClass ?? "",
    invoicerEmail: s.email ?? "",
    invoiceeType: "사업자",
    invoiceeCorpNum: digits(b.corpNum),
    invoiceeCorpName: b.corpName,
    invoiceeCEOName: b.ceoName,
    invoiceeAddr: b.addr ?? "",
    invoiceeBizType: b.bizType ?? "",
    invoiceeBizClass: b.bizClass ?? "",
    invoiceeEmail1: b.email ?? "",
    detailList: [
      {
        serialNum: 1,
        purchaseDT: input.writeDate,
        itemName: input.itemName,
        supplyCost: String(input.supplyCost),
        tax: String(input.tax),
      },
    ],
  };
  const r = await call<{ ntsConfirmNum?: string; issueDT?: string }>(
    "registIssue",
    digits(s.corpNum),
    taxinvoice,
    false, // writeSpecification
    false, // forceIssue (지연발행 강제 X — 지연발행이면 오류로 알려 준다)
    "",
    "",
    "",
    input.userId ?? "",
  );
  return { ntsConfirmNum: r.ntsConfirmNum ?? null, issueDT: r.issueDT ?? null };
}

export type InvoiceInfo = { stateCode: number; ntsConfirmNum: string | null; issueDT: string | null };

/** 문서번호로 상태 조회. 없는 문서면 null */
export async function getInvoiceInfo(corpNum: string, mgtKey: string): Promise<InvoiceInfo | null> {
  try {
    const r = await call<{ stateCode: number; ntsconfirmNum?: string; issueDT?: string }>(
      "getInfo",
      digits(corpNum),
      popbill.MgtKeyType.SELL,
      mgtKey,
    );
    return { stateCode: r.stateCode, ntsConfirmNum: r.ntsconfirmNum ?? null, issueDT: r.issueDT ?? null };
  } catch (error) {
    if (error instanceof PopbillError && error.code !== -2 && error.code !== -3 && error.code !== -1) return null;
    throw error;
  }
}

/** 세금계산서 보기 팝업 URL(공급자 기준). 30초 안에 열어야 한다. */
export async function getInvoiceViewUrl(corpNum: string, mgtKey: string): Promise<string> {
  return call<string>("getPopUpURL", digits(corpNum), popbill.MgtKeyType.SELL, mgtKey);
}

/** 파트너 포인트 잔액 */
export async function getPartnerBalance(anyMemberCorpNum: string): Promise<number> {
  return call<number>("getPartnerBalance", digits(anyMemberCorpNum));
}

/** "20270706145209"(KST) → Date */
export function parseKstDateTime(v: string | null | undefined): Date | null {
  if (!v || !/^\d{14}$/.test(v)) return null;
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
