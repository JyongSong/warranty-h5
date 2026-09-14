// IoT Pass(device_feature_upgrades) 백오피스 입력값 검증.
//
// 이 표는 cafe24 웹훅과 서드파티 API(device-upgrade-status)도 함께 쓴다.
// 그쪽이 SN 을 대문자로 저장하므로 백오피스에서 넣는 값도 같은 규칙을 따른다.
// 그러지 않으면 같은 기기가 대소문자만 다른 두 줄로 남는다.

type Body = Record<string, unknown>;

export const IOT_PASS_PURCHASE_STATUSES = ["pending", "paid"] as const;

export type IotPassPurchaseStatus = (typeof IOT_PASS_PURCHASE_STATUSES)[number];

export function normalizeIotPassSn(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function trimmed(value: unknown) {
  return String(value ?? "").trim();
}

function nullableString(value: unknown) {
  const text = trimmed(value);
  return text ? text : null;
}

function nullableDate(value: unknown) {
  const text = trimmed(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
  return date;
}

function purchaseStatus(value: unknown) {
  const text = trimmed(value) || "pending";
  if (!IOT_PASS_PURCHASE_STATUSES.includes(text as IotPassPurchaseStatus)) {
    throw new Error("결제 상태 값이 올바르지 않습니다.");
  }
  return text;
}

function requiredSn(value: unknown) {
  const sn = normalizeIotPassSn(value);
  if (!sn) {
    throw new Error("SN 을 입력해 주세요.");
  }
  return sn;
}

export function parseIotPassPayload(body: Body) {
  return {
    sn: requiredSn(body.sn),
    contact: nullableString(body.contact),
    purchase_status: purchaseStatus(body.purchaseStatus),
    // 지금은 zigbee 하나뿐이지만 표는 기능 코드별로 쓰게 되어 있다.
    feature_code: trimmed(body.featureCode) || "zigbee",
    // 웹훅은 cafe24, 서드파티 API 는 none 을 남긴다. 백오피스 수기 등록은 manual.
    payment_provider: trimmed(body.paymentProvider) || "manual",
    paid_at: nullableDate(body.paidAt),
    last_hub_bound_at: nullableDate(body.lastHubBoundAt),
  };
}

/** 보낸 항목만 바꾼다. 폼에 없는 항목이 기본값으로 덮이면 안 된다. */
export function parseIotPassPatch(body: Body) {
  const data: Record<string, unknown> = { updated_at: new Date() };

  if ("sn" in body) data.sn = requiredSn(body.sn);
  if ("contact" in body) data.contact = nullableString(body.contact);
  if ("purchaseStatus" in body) data.purchase_status = purchaseStatus(body.purchaseStatus);
  if ("featureCode" in body) data.feature_code = trimmed(body.featureCode) || "zigbee";
  if ("paymentProvider" in body) data.payment_provider = trimmed(body.paymentProvider) || "manual";
  if ("paidAt" in body) data.paid_at = nullableDate(body.paidAt);
  if ("lastHubBoundAt" in body) data.last_hub_bound_at = nullableDate(body.lastHubBoundAt);

  return data;
}

/** 화면으로 나가는 한 줄. 날짜는 ISO 문자열로 바꿔 클라이언트 컴포넌트에 넘긴다. */
export type IotPassItem = {
  id: string;
  sn: string;
  contact: string | null;
  purchaseStatus: string;
  featureCode: string;
  paymentProvider: string;
  paidAt: string | null;
  lastHubBoundAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 출고 기기 목록(shipped_devices)에 있는 모델명. 목록에 없으면 null. */
  deviceModel: string | null;
  shipped: boolean;
};

type IotPassRow = {
  id: string;
  sn: string;
  contact: string | null;
  purchase_status: string;
  feature_code: string;
  payment_provider: string;
  paid_at: Date | null;
  last_hub_bound_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function serializeIotPass(
  row: IotPassRow,
  shipped: { model: string | null } | null,
): IotPassItem {
  return {
    id: row.id,
    sn: row.sn,
    contact: row.contact,
    purchaseStatus: row.purchase_status,
    featureCode: row.feature_code,
    paymentProvider: row.payment_provider,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    lastHubBoundAt: row.last_hub_bound_at ? row.last_hub_bound_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deviceModel: shipped?.model ?? null,
    shipped: Boolean(shipped),
  };
}
