export type CustomerInputSource = {
  installAddress: string | null;
  customerPhone: string | null;
};

export type CustomerInputStatus = "VALID" | "EXPIRED" | "SUBMITTED" | "CANCELLED" | null;

export const CUSTOMER_REQUEST_UNAVAILABLE_STATUS = {
  title: "유효하지 않거나 이미 접수된 정보입니다",
  description:
    "입력 링크를 다시 확인해 주세요. 이미 정보를 접수한 경우 추가 입력은 필요하지 않습니다. 예약 정보를 변경해야 하는 경우 고객센터로 문의해 주세요.",
} as const;

export function getInitialCustomerInputValues(
  request: CustomerInputSource | null,
  status: CustomerInputStatus,
) {
  if (status !== "SUBMITTED") {
    return {
      address: "",
      phone: "",
    };
  }

  return {
    address: request?.installAddress ?? "",
    phone: request?.customerPhone ?? "",
  };
}

export function getSubmittedStatusScreenContent({
  justSubmitted,
  serverStatus,
}: {
  justSubmitted: boolean;
  serverStatus: CustomerInputStatus;
}) {
  if (justSubmitted) {
    return {
      title: "예약 정보가 접수되었습니다",
      description: "입력하신 설치 장소와 희망 일정 기준으로 담당자가 확인 후 안내드리겠습니다.",
      showSummary: true,
      tone: "success" as const,
    };
  }

  if (serverStatus === "SUBMITTED") {
    return {
      ...CUSTOMER_REQUEST_UNAVAILABLE_STATUS,
      showSummary: false,
      tone: "warning" as const,
    };
  }

  return null;
}

export function isCustomerRequestUnavailableError(error: string) {
  return [
    "MISSING_TOKEN",
    "TOKEN_NOT_FOUND",
    "TOKEN_EXPIRED",
    "ALREADY_SUBMITTED",
    "REQUEST_CANCELLED",
  ].includes(error);
}

export function formatOrderProductSummary(memo: string) {
  const products = memo
    .split("/")
    .map((product) => product.trim())
    .filter(Boolean);

  if (products.length <= 1) {
    return memo.trim();
  }

  return `${products[0]} 외`;
}
