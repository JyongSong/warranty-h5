import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { buildUserCompletionSms } from "@/lib/userSms";
import { cjRegConfirmedBy, parseCjRegLinkToken, type CjRegLink } from "./cjRegLink";

// 본사 공인 기사 시공과 같은 2년. 일반 /reg 의 installer 경로와 같은 계산이다.
const FREE_AS_DAYS = 730;

export type CjRegisterError =
  | "INVALID_LINK"
  | "LINK_EXPIRED"
  | "LINK_ALREADY_USED"
  | "INVALID_SN"
  | "INVALID_INSTALL_DATE"
  | "INSTALL_DATE_BEFORE_SHIP"
  | "INSTALL_DATE_IN_FUTURE"
  | "CONSENT_REQUIRED"
  | "SN_NOT_FOUND"
  | "ALREADY_CONFIRMED";

export type CjRegisterResult =
  | { ok: true; id: string; freeAsEndDate: string; installerPhone: string | null }
  | { ok: false; error: CjRegisterError };

export function getKstToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}

// UTC 로 계산해 서버 시간대와 상관없이 같은 날짜가 나오게 한다.
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 이 주문으로 이미 등록된 대수. 수량에 닿으면 링크는 더 쓸 수 없다. */
export function countCjRegistrations(orderNo: string) {
  return prisma.warrantyRegistration.count({
    where: { confirmedBy: cjRegConfirmedBy(orderNo), status: "confirmed" },
  });
}

export async function isCjRegLinkUsedUp(link: CjRegLink) {
  return (await countCjRegistrations(link.orderNo)) >= link.quantity;
}

/**
 * 기사 확인 없이 2년 무상 A/S 로 바로 확정한다.
 * 전화번호는 링크에 서명된 주문 연락처를 쓴다 — 화면에서 받지 않는다.
 */
export async function registerByCjLink(input: {
  token: string;
  sn: string;
  installDate: string;
  consentPrivacy: boolean;
  consentMarketing: boolean;
}): Promise<CjRegisterResult> {
  const parsed = parseCjRegLinkToken(input.token);
  if (!parsed.ok) return parsed;
  const { link } = parsed;

  const sn = input.sn.trim();
  const installDate = input.installDate;
  if (!sn || sn.length < 6) return { ok: false, error: "INVALID_SN" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installDate)) return { ok: false, error: "INVALID_INSTALL_DATE" };
  if (installDate < link.shipDate) return { ok: false, error: "INSTALL_DATE_BEFORE_SHIP" };
  if (installDate > getKstToday()) return { ok: false, error: "INSTALL_DATE_IN_FUTURE" };
  if (!input.consentPrivacy) return { ok: false, error: "CONSENT_REQUIRED" };

  if (await isCjRegLinkUsedUp(link)) return { ok: false, error: "LINK_ALREADY_USED" };

  const shipped = await prisma.shippedDevice.findUnique({ where: { sn }, select: { sn: true } });
  if (!shipped) return { ok: false, error: "SN_NOT_FOUND" };

  const existing = await prisma.warrantyRegistration.findUnique({
    where: { sn },
    select: { id: true, status: true },
  });
  if (existing?.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };

  const freeAsEndDate = addDays(installDate, FREE_AS_DAYS);
  // 기사 확인을 거치지 않으므로 처음부터 confirmed. 확인 토큰은 비워 둔다.
  // 기사 설치 건수(install_count)는 누가 설치했는지 모르므로 올리지 않는다.
  const data = {
    installType: "installer",
    installDate,
    userPhone: link.userPhone,
    installerPhone: link.installerPhone,
    consentPrivacy: true,
    consentMarketing: input.consentMarketing,
    status: "confirmed",
    confirmToken: null,
    confirmTokenExpiresAt: null,
    freeAsEndDate,
    submittedAt: new Date(),
    confirmedAt: new Date(),
    confirmedBy: cjRegConfirmedBy(link.orderNo),
  };

  let id: string;
  if (existing) {
    // 일반 /reg 로 냈다가 기사 확인을 못 받은 건(submitted)을 이 링크로 마무리하는 경우.
    await prisma.warrantyRegistration.update({ where: { id: existing.id }, data });
    id = existing.id;
  } else {
    id = crypto.randomUUID();
    await prisma.warrantyRegistration.create({ data: { id, sn, ...data } });
  }

  const sms = buildUserCompletionSms({
    installType: "installer",
    freeAsEndDate,
    installerPhone: link.installerPhone,
  });
  await sendSms(link.userPhone, sms.text, sms.subject, { alimtalk: sms.alimtalk });
  console.log("[SMS SENT][CJ REGISTER→USER]", { to: link.userPhone, orderNo: link.orderNo });

  return { ok: true, id, freeAsEndDate, installerPhone: link.installerPhone };
}
