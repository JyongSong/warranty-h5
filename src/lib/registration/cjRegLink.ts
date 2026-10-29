import crypto from "crypto";

/**
 * CJ 온스타일 배정 건 전용 무상 A/S 등록 링크(/reg/cj/<token>).
 *
 * 열쇠 업체로 배정된 CJ 주문은 누가 언제 설치했는지 우리가 모른다. 고객이 기사
 * 전화번호를 모르거나 기사가 확인 링크를 눌러 주지 않으면 일반 /reg 로는 2년 등록이
 * 끝나지 않는다. 그래서 이 명단에 한해 기사 확인 없이 2년으로 바로 확정한다.
 *
 * 기사 확인을 건너뛰는 대신 문은 링크 자체로 잠근다. 주문번호·전화번호·출고일을
 * 서명해 넣으므로 명단 밖 사람은 만들 수 없고, 한 주문은 수량만큼만 등록된다.
 * 테이블을 새로 만들지 않으려고 토큰은 상태 없이(stateless) 두고, 사용 여부는
 * warranty_registrations.confirmed_by 에 남긴 주문번호로 센다.
 */

export const CJ_REG_LINK_TTL_DAYS = 90;
export const CJ_REG_CONFIRMED_BY_PREFIX = "cj_dispatch:";

// 용도를 서명에 섞어 다른 서명 토큰과 서로 바꿔 쓸 수 없게 한다.
const SIGNING_SCOPE = "cj-reg-link-v1";
// 문자에 들어가는 링크라 짧을수록 좋다. HMAC-SHA256 앞 16바이트면 충분하다.
const SIGNATURE_BYTES = 16;

export type CjRegLink = {
  orderNo: string;
  userPhone: string;
  /** 출고일 YYYY-MM-DD. 설치 완료일의 하한. */
  shipDate: string;
  /** 배정된 업체 연락처. 업체가 기사 명부에 없으면 null. */
  installerPhone: string | null;
  quantity: number;
  /** 만료 시각 (epoch seconds) */
  exp: number;
};

type CompactPayload = { o: string; p: string; d: string; i?: string; q: number; e: number };

function getSecret() {
  const secret =
    process.env.CJ_REG_LINK_SECRET?.trim() || process.env.MANAGEMENT_SESSION_SECRET?.trim();
  if (!secret) throw new Error("CJ_REG_LINK_SECRET_MISSING");
  return secret;
}

function sign(data: string) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${SIGNING_SCOPE}.${data}`)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

export function createCjRegLinkToken(
  input: Omit<CjRegLink, "exp">,
  now = Date.now(),
): string {
  const payload: CompactPayload = {
    o: input.orderNo,
    p: input.userPhone,
    d: input.shipDate,
    q: input.quantity,
    e: Math.floor(now / 1000) + CJ_REG_LINK_TTL_DAYS * 24 * 3600,
  };
  if (input.installerPhone) payload.i = input.installerPhone;

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export type CjRegLinkParseResult =
  | { ok: true; link: CjRegLink }
  | { ok: false; error: "INVALID_LINK" | "LINK_EXPIRED" };

export function parseCjRegLinkToken(
  token: string | null | undefined,
  now = Date.now(),
): CjRegLinkParseResult {
  const [data, signature] = String(token ?? "").split(".");
  if (!data || !signature) return { ok: false, error: "INVALID_LINK" };

  const left = Buffer.from(signature);
  const right = Buffer.from(sign(data));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, error: "INVALID_LINK" };
  }

  let parsed: CompactPayload;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as CompactPayload;
  } catch {
    return { ok: false, error: "INVALID_LINK" };
  }
  if (!parsed?.o || !parsed.p || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.d) || typeof parsed.e !== "number") {
    return { ok: false, error: "INVALID_LINK" };
  }
  if (parsed.e * 1000 <= now) return { ok: false, error: "LINK_EXPIRED" };

  return {
    ok: true,
    link: {
      orderNo: parsed.o,
      userPhone: parsed.p,
      shipDate: parsed.d,
      installerPhone: parsed.i ?? null,
      quantity: Number.isInteger(parsed.q) && parsed.q > 0 ? parsed.q : 1,
      exp: parsed.e,
    },
  };
}

export function cjRegConfirmedBy(orderNo: string) {
  return `${CJ_REG_CONFIRMED_BY_PREFIX}${orderNo}`;
}

export function cjRegLinkPath(token: string) {
  return `/reg/cj/${token}`;
}
