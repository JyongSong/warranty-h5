const CUSTOMER_REQUEST_ERROR_MESSAGES: Record<string, string> = {
  MISSING_TOKEN: "링크 토큰이 없습니다. 문자로 받은 링크를 다시 열어 주세요.",
  TOKEN_NOT_FOUND: "유효하지 않은 링크입니다. 문자로 받은 최신 링크를 다시 열어 주세요.",
  TOKEN_EXPIRED: "입력 링크가 만료되었습니다. 고객센터 안내를 기다려 주세요.",
  ALREADY_SUBMITTED: "이미 설치 요청 정보가 접수되었습니다.",
  REQUEST_CANCELLED: "이미 취소된 설치 요청입니다.",
  INSTALL_ADDRESS_REQUIRED: "설치 주소를 입력해 주세요.",
  INSTALL_ADDRESS_UNPARSEABLE: "설치 주소에 시/도와 시/군/구를 포함해 입력해 주세요.",
  INSTALL_DATE_INVALID: "설치일을 올바른 날짜로 입력해 주세요.",
  INSTALL_DATE_OUT_OF_RANGE: "설치일은 오늘 기준 2일 뒤부터 30일 뒤까지만 선택할 수 있습니다.",
  CUSTOMER_PHONE_REQUIRED: "연락처를 입력해 주세요.",
  INTERNAL_ERROR: "일시적으로 제출할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

export function getInstallationCustomerRequestErrorMessage(error: string) {
  return CUSTOMER_REQUEST_ERROR_MESSAGES[error] ?? CUSTOMER_REQUEST_ERROR_MESSAGES.INTERNAL_ERROR;
}
