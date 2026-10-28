// 협력사(PL) 주문의 설치 품목.
//
// 원천 메모("품목명 x수량 / ...")의 용역 품목을 이카운트 구매 품목코드 이름으로 바꿔 보여준다.
// 품목코드표는 「설치 접수 방법 _260507」 엑셀의 품목코드 시트, 대응은 2026 이카운트 PL 이력 기준.
// 본사 관리자가 고치면 installation_orders.partner_install_items 에 저장하고, 없으면 메모에서 자동으로 뽑는다.

export const PARTNER_INSTALL_ITEM_CATALOG = [
  { code: "00046", name: "월패드 연동 설치" },
  { code: "00047", name: "L100도어락설치" },
  { code: "00048", name: "L100도어락설치+월패드연동설치" },
  { code: "00049", name: "K100도어락설치+월패드연동설치" },
  { code: "00050", name: "K100도어락설치" },
  { code: "00051", name: "U100도어락 설치" },
  { code: "00052", name: "커튼레일 설치" },
  { code: "00053", name: "조명스위치 설치" },
  { code: "00054", name: "도어벨설치" },
  { code: "00060", name: "도어락 원복설치 서비스" },
  { code: "00061", name: "도어락 설치만 구매(모델명확인후진행)" },
  { code: "00068", name: "슬림면조명 설치(타공 없음)" },
  { code: "00069", name: "다운라이트 설치(타공 포함)" },
  { code: "00070", name: "블라인드 설치" },
  { code: "00071", name: "용역 커튼레일(커튼 천 결합) 설치비" },
  { code: "00072", name: "용역 도어벨 설치서비스 (컨버터+마감판 포함)" },
] as const;

export type PartnerInstallItem = {
  /** 이카운트 품목코드. 코드표에 없는 작업이면 null */
  code: string | null;
  name: string;
  quantity: number;
  /** 고객이 현장에서 협력사에 직접 내는 작업 (본사 청구 대상 아님) */
  onsitePayment: boolean;
};

export const PARTNER_INSTALL_ITEMS_MAX = 30;
const ITEM_NAME_MAX = 60;
const ITEM_QUANTITY_MAX = 999;

const CATALOG_NAME_BY_CODE = new Map<string, string>(PARTNER_INSTALL_ITEM_CATALOG.map((item) => [item.code, item.name]));

function catalogItem(code: string, quantity: number, onsitePayment = false): PartnerInstallItem {
  return { code, name: CATALOG_NAME_BY_CODE.get(code) ?? code, quantity, onsitePayment };
}

// 작업이 아닌 용역 품목: 출장비, 용역매출, 컨설팅비, 스마트홈 설계·설치·앱 설정 서비스 (이카운트에도 안 올림)
const NON_WORK_ITEM = /^(용역\s*)?(출장비|용역매출|컨설팅비|스마트홈\s)/;

// 도어락 외 용역 품목 → 품목코드. 앞에서부터 처음 맞는 것을 쓴다.
const SERVICE_ITEM_RULES: Array<{ match: RegExp; code: string | null; name?: string }> = [
  { match: /^도어락 원상복구/, code: "00060" },
  { match: /^연동 설치/, code: "00046" },
  { match: /^도어벨/, code: "00054" },
  { match: /^커튼레일\(커튼 천 결합\)/, code: "00071" },
  { match: /^커튼레일\(전원선매립\)/, code: null, name: "커튼레일(전원선매립) 설치" },
  { match: /^커튼레일/, code: "00052" },
  { match: /^길이조절 커튼 레일/, code: "00052" },
  { match: /^커튼\/블라인드 실측/, code: null, name: "커튼/블라인드 실측" },
  { match: /^조명 스위치/, code: "00053" },
  { match: /^슬림 면조명/, code: "00068" },
  { match: /^다운라이트/, code: "00069" },
  { match: /^블라인드/, code: "00070" },
];

const DOORLOCK_CODE: Record<string, string> = { K100: "00050", L100: "00047", U100: "00051" };
const DOORLOCK_WALLPAD_CODE: Record<string, string> = { K100: "00049", L100: "00048" };

type MemoSegment = { name: string; quantity: number };

function splitMemo(memo: string): MemoSegment[] {
  return memo
    .split(" / ")
    .map((segment) => {
      const match = /^(.*?)\s*x\s*(\d+)\s*$/i.exec(segment.trim());
      return {
        name: (match ? match[1] : segment).replace(/^★\s*/, "").trim(),
        quantity: match ? Number(match[2]) : 1,
      };
    })
    .filter((segment) => segment.name);
}

function isServiceSegment(name: string) {
  return name.startsWith("용역") || name.startsWith("길이조절 커튼 레일");
}

/**
 * 원천 메모에서 협력사가 할 설치 작업을 이카운트 품목으로 뽑는다.
 * - 도어락 설치비(K100/L100/U100) → 00050/00047/00051, 모델 없는 도어락 설치비는 메모의 제품 모델로, 그래도 없으면 00061
 * - 같은 주문의 월패드 모듈 설치비는 K100/L100 도어락과 묶어 00049/00048, 남는 월패드는 00046
 * - 연동 설치비(현장결제)는 00046 + 현장결제 표시
 * - 출장비·용역매출·컨설팅·스마트홈 서비스는 뺀다. 코드표에 없는 용역은 이름만 정리해서 남긴다.
 */
export function deriveInstallItemsFromMemo(memo: string | null | undefined): PartnerInstallItem[] {
  if (!memo) return [];

  const segments = splitMemo(memo).filter((segment) => isServiceSegment(segment.name));
  const productModel = /\b(K100|L100|U100)\b/.exec(memo)?.[1] ?? null;

  let wallpadLeft = segments
    .filter((segment) => /^용역 월패드 모듈 설치/.test(segment.name))
    .reduce((sum, segment) => sum + segment.quantity, 0);

  const items: PartnerInstallItem[] = [];
  for (const segment of segments) {
    const name = segment.name;
    if (NON_WORK_ITEM.test(name)) continue;

    const doorlock = /^용역 도어락 설치비\s*(?:\((K100|L100|U100)\))?(\+월패드 연동)?/.exec(name);
    if (doorlock && !/원상복구/.test(name)) {
      const model = doorlock[1] ?? productModel;
      if (!model) {
        items.push(catalogItem("00061", segment.quantity));
        continue;
      }
      if (doorlock[2] && DOORLOCK_WALLPAD_CODE[model]) {
        items.push(catalogItem(DOORLOCK_WALLPAD_CODE[model], segment.quantity));
        continue;
      }
      const combined = DOORLOCK_WALLPAD_CODE[model] ? Math.min(segment.quantity, wallpadLeft) : 0;
      if (combined > 0) {
        items.push(catalogItem(DOORLOCK_WALLPAD_CODE[model], combined));
        wallpadLeft -= combined;
      }
      if (segment.quantity > combined) items.push(catalogItem(DOORLOCK_CODE[model], segment.quantity - combined));
      continue;
    }

    if (/^용역 월패드 모듈 설치/.test(name)) continue; // 도어락과 묶고 남은 수량은 맨 끝에 한 번에 넣는다

    const bare = name.replace(/^용역\s*/, "");
    const onsitePayment = /\(현장\s*결제\)/.test(bare);
    const rule = SERVICE_ITEM_RULES.find((candidate) => candidate.match.test(bare));
    if (rule?.code) {
      items.push(catalogItem(rule.code, segment.quantity, onsitePayment));
    } else {
      items.push({
        code: null,
        name: rule?.name ?? cleanServiceName(bare),
        quantity: segment.quantity,
        onsitePayment,
      });
    }
  }

  if (wallpadLeft > 0) items.push(catalogItem("00046", wallpadLeft));
  // 이카운트처럼 도어락 작업을 맨 앞에 둔다 (나머지는 메모 순서 그대로).
  const merged = mergeSameItems(items);
  return [...merged.filter(isDoorlockItem), ...merged.filter((item) => !isDoorlockItem(item))];
}

const DOORLOCK_ITEM_CODES = new Set(["00047", "00048", "00049", "00050", "00051", "00060", "00061"]);

function isDoorlockItem(item: PartnerInstallItem) {
  return item.code !== null && DOORLOCK_ITEM_CODES.has(item.code);
}

function cleanServiceName(name: string) {
  return name
    .replace(/\s*\([^)]*결제[^)]*\)/g, "")
    .replace(/설치(비|서비스)/g, "설치")
    .trim();
}

function mergeSameItems(items: PartnerInstallItem[]) {
  const merged: PartnerInstallItem[] = [];
  for (const item of items) {
    const same = merged.find(
      (existing) =>
        existing.code === item.code && existing.name === item.name && existing.onsitePayment === item.onsitePayment,
    );
    if (same) same.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

/** DB(JSONB)에 저장된 값을 읽는다. 형식이 깨졌으면 null → 자동 판별로 보여준다. */
export function readStoredInstallItems(value: unknown): PartnerInstallItem[] | null {
  if (!Array.isArray(value)) return null;
  try {
    return normalizeInstallItems(value);
  } catch {
    return null;
  }
}

export class PartnerInstallItemsError extends Error {}

/** 본사 관리자가 입력한 설치 품목을 검사해서 저장할 형태로 만든다. 빈 목록도 허용한다. */
export function normalizeInstallItems(input: unknown[]): PartnerInstallItem[] {
  if (input.length > PARTNER_INSTALL_ITEMS_MAX) throw new PartnerInstallItemsError("INSTALL_ITEMS_TOO_MANY");

  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw new PartnerInstallItemsError("INSTALL_ITEM_INVALID");
    const item = raw as Record<string, unknown>;

    const code = typeof item.code === "string" && item.code.trim() ? item.code.trim() : null;
    if (code && !CATALOG_NAME_BY_CODE.has(code)) throw new PartnerInstallItemsError("INSTALL_ITEM_CODE_INVALID");

    // 코드표 품목은 이름을 코드표대로 고정한다. 직접 입력 품목만 이름을 받는다.
    const name = code
      ? (CATALOG_NAME_BY_CODE.get(code) as string)
      : typeof item.name === "string"
        ? item.name.trim().replace(/\s+/g, " ")
        : "";
    if (!name) throw new PartnerInstallItemsError("INSTALL_ITEM_NAME_REQUIRED");
    if (name.length > ITEM_NAME_MAX) throw new PartnerInstallItemsError("INSTALL_ITEM_NAME_TOO_LONG");

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > ITEM_QUANTITY_MAX) {
      throw new PartnerInstallItemsError("INSTALL_ITEM_QUANTITY_INVALID");
    }

    return { code, name, quantity, onsitePayment: item.onsitePayment === true };
  });
}

/** 저장된 값이 있으면 그것을, 없으면 메모에서 자동으로 뽑은 값을 쓴다. */
export function resolvePartnerInstallItems(stored: unknown, memo: string | null | undefined) {
  const saved = readStoredInstallItems(stored);
  return saved
    ? { items: saved, edited: true }
    : { items: deriveInstallItemsFromMemo(memo), edited: false };
}

export function formatInstallItemsText(items: PartnerInstallItem[]) {
  if (items.length === 0) return "(없음)";
  return items
    .map((item) => `${item.name} ×${item.quantity}${item.onsitePayment ? " (현장결제)" : ""}`)
    .join(", ");
}
