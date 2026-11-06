import { ProxyAgent, request, type Dispatcher } from "undici";

// CJ 온스타일 협력사 표준 API 중 배송 통합 조회(getDeliveryList).
// 문서: partners.cjonstyle.com/standardApi/apiDocs?drServiceType=04
//
// CJ 는 등록된 고정 IP 에서 오는 요청만 받는다. Vercel 은 출구 IP 가 고정이
// 아니라서, 회사 고정 IP 에 둔 HTTP 프록시(CJ_API_PROXY_URL)를 거쳐 나간다.
// HTTPS 는 CONNECT 터널이라 프록시는 내용을 보지 못한다.
//
// 응답에는 주문자·인수자 이름/전화/주소 같은 개인정보가 함께 오지만, 우리가
// 쓰는 것은 주문번호와 결제일뿐이다. 나머지는 여기서 버리고 밖으로 내보내지
// 않는다.

export const CJ_API_DEFAULT_BASE_URL = "https://ingress-api.cjoshopping.com";

export type CjApiConfig = {
  baseUrl: string;
  vendorCode: string;
  authenticationKey: string;
  proxyUrl: string | null;
  // 빈 문자열은 "배송방법 미지정"(CJ 기본: 10 센터배송 제외 전부)이다.
  deliveryMethodCodes: string[];
  // 이 상품코드의 주문만 명단에 넣는다. 같은 협력사 계정으로 스위치·허브 같은
  // 설치 없는 상품도 팔기 때문에 거르지 않으면 명단이 오염된다.
  itemCodes: string[];
};

// [CJ단독] 아카라 스마트 도어락 K100 웜다크실버 방문설치 패키지
export const CJ_API_DEFAULT_ITEM_CODES = ["2093860797"];

export function readCjApiConfig(env: NodeJS.ProcessEnv = process.env): CjApiConfig | null {
  const vendorCode = env.CJ_API_VENDOR_CODE?.trim();
  const authenticationKey = env.CJ_API_AUTH_KEY?.trim();
  if (!vendorCode || !authenticationKey) return null;

  return {
    baseUrl: (env.CJ_API_BASE_URL?.trim() || CJ_API_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    vendorCode,
    authenticationKey,
    proxyUrl: env.CJ_API_PROXY_URL?.trim() || null,
    deliveryMethodCodes: parseDeliveryMethodCodes(env.CJ_API_DELIVERY_METHOD_CODES),
    itemCodes: parseItemCodes(env.CJ_API_ITEM_CODES),
  };
}

// 기본값은 "미지정 + 10". 미지정은 10 센터배송을 빼고 조회하므로, 둘을 합쳐야
// 배송방법과 상관없이 전부 잡힌다. 실제 배송방법이 확인되면 env 로 좁힌다.
export function parseDeliveryMethodCodes(raw: string | undefined) {
  if (raw === undefined || raw.trim() === "") return ["", "10"];

  const codes = raw
    .split(",")
    .map((code) => code.trim())
    .map((code) => (code === "-" ? "" : code))
    .filter((code) => code === "" || /^\d{2}$/.test(code));
  return codes.length > 0 ? Array.from(new Set(codes)) : ["", "10"];
}

export function parseItemCodes(raw: string | undefined) {
  const codes = (raw ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => /^\d{6,25}$/.test(code));
  return codes.length > 0 ? Array.from(new Set(codes)) : [...CJ_API_DEFAULT_ITEM_CODES];
}

export type CjDeliveryQuery = {
  // 3 출고일
  dateType: "3";
  startDate: string;
  endDate: string;
  // 4 출고, 5 배송완료
  deliveryStatus: "4" | "5";
  deliveryMethodCode: string;
  // 상품코드(itemInformation=1 로 보냄)
  itemCode: string;
  // 2 주문(취소·교환 제외)
  orderType: "2";
};

export type CjDeliveryRow = {
  orderNo?: string | null;
  orderItemSequence?: string | null;
  orderDetailSequence?: string | null;
  orderProcessingSequence?: string | null;
  paymentDate?: string | null;
  itemCode?: string | null;
};

type CjDeliveryResponse = {
  returnStatus?: number;
  returnCode?: string;
  returnMessage?: string;
  error?: boolean;
  data?: CjDeliveryRow[] | null;
};

export class CjApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "CjApiError";
  }
}

let cachedDispatcher: { url: string; agent: Dispatcher } | null = null;

function getDispatcher(proxyUrl: string | null) {
  if (!proxyUrl) return undefined;
  if (cachedDispatcher?.url !== proxyUrl) {
    cachedDispatcher = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  return cachedDispatcher.agent;
}

export async function fetchCjDeliveryList(
  config: CjApiConfig,
  query: CjDeliveryQuery,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<CjDeliveryRow[]> {
  const body: Record<string, string> = {
    dateType: query.dateType,
    startDate: query.startDate,
    endDate: query.endDate,
    deliveryStatus: query.deliveryStatus,
    orderType: query.orderType,
  };
  if (query.deliveryMethodCode) body.deliveryMethodCode = query.deliveryMethodCode;
  if (query.itemCode) {
    body.itemInformation = "1";
    body.itemCode = query.itemCode;
  }

  let statusCode: number;
  let text: string;
  try {
    const response = await request(`${config.baseUrl}/delivery/getDeliveryList`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        vendorCode: config.vendorCode,
        authenticationKey: config.authenticationKey,
      },
      body: JSON.stringify(body),
      dispatcher: getDispatcher(config.proxyUrl),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    statusCode = response.statusCode;
    text = await response.body.text();
  } catch (error) {
    // 프록시 접속 실패·CJ 방화벽 차단(대개 연결이 끊김)이 여기로 온다.
    throw new CjApiError(
      `CJ API 연결 실패: ${error instanceof Error ? error.message : String(error)}`,
      "CJ_API_NETWORK",
    );
  }

  let parsed: CjDeliveryResponse;
  try {
    parsed = JSON.parse(text) as CjDeliveryResponse;
  } catch {
    // 등록 안 된 IP 에서 부르면 CJ 게이트웨이가 HTML "403 Forbidden" 을 준다.
    if (statusCode === 403) {
      throw new CjApiError("CJ API 403: 요청 IP 가 CJ 방화벽에 등록되지 않았음", "CJ_API_IP_FORBIDDEN");
    }
    throw new CjApiError(`CJ API 응답이 JSON 이 아님 (HTTP ${statusCode})`, "CJ_API_BAD_RESPONSE");
  }

  if (statusCode !== 200 || parsed.error || (parsed.returnStatus && parsed.returnStatus !== 200)) {
    throw new CjApiError(
      `CJ API 오류 (HTTP ${statusCode}, ${parsed.returnCode ?? "-"}): ${parsed.returnMessage ?? ""}`,
      "CJ_API_ERROR",
    );
  }

  return Array.isArray(parsed.data) ? parsed.data : [];
}

// 업로드 명단과 같은 23자리 시스템 번호: 주문번호 14 + 순번 3 × 3.
export function toCjManifestRow(row: CjDeliveryRow): { orderNo: string; orderDate: string | null } | null {
  const orderNo = row.orderNo?.trim() ?? "";
  if (!/^\d{14}$/.test(orderNo)) return null;

  const sequences = [row.orderItemSequence, row.orderDetailSequence, row.orderProcessingSequence].map(
    (value) => value?.trim() ?? "",
  );
  if (!sequences.every((value) => /^\d{1,3}$/.test(value))) return null;

  const paymentDate = row.paymentDate?.trim().slice(0, 10) ?? "";
  const orderDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? paymentDate : null;

  return {
    orderNo: orderNo + sequences.map((value) => value.padStart(3, "0")).join(""),
    orderDate,
  };
}

// KST 기준 날짜(YYYY-MM-DD). CJ 날짜 조건은 한국 날짜다.
export function kstDate(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 오늘 포함 최근 lookbackDays 일(KST). CJ 는 최대 1개월까지 받는다.
export function cjSyncDateRange(now: Date, lookbackDays: number) {
  const days = Math.min(Math.max(Math.trunc(lookbackDays), 1), 30);
  return {
    startDate: kstDate(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)),
    endDate: kstDate(now),
  };
}
