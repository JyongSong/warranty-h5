import {
  INSTALL_DATE_MAX_DAYS_AHEAD,
  INSTALL_DATE_MIN_DAYS_AHEAD,
} from "@/lib/installation/customer/timing";

/**
 * 폼(입력 중 즉시 안내)과 서버 오류가 같은 문구를 쓰도록 여기서 export 한다.
 */
export const SAFE_NUMBER_MESSAGE =
  "안심번호(050)는 며칠 뒤 만료되어 설치 기사님이 연락드릴 수 없습니다. 실제 사용하시는 휴대폰 번호를 입력해 주세요.";

export const NOT_MOBILE_MESSAGE =
  "휴대폰 번호를 입력해 주세요. (010으로 시작하는 번호)";

const CUSTOMER_REQUEST_ERROR_MESSAGES: Record<string, string> = {
  MISSING_TOKEN: "링크 토큰이 없습니다. 문자로 받은 링크를 다시 열어 주세요.",
  TOKEN_NOT_FOUND: "유효하지 않은 링크입니다. 문자로 받은 최신 링크를 다시 열어 주세요.",
  TOKEN_EXPIRED: "입력 링크가 만료되었습니다. 고객센터 안내를 기다려 주세요.",
  ALREADY_SUBMITTED: "이미 설치 요청 정보가 접수되었습니다.",
  REQUEST_CANCELLED: "이미 취소된 설치 요청입니다.",
  INSTALL_ADDRESS_REQUIRED: "설치 주소를 입력해 주세요.",
  INSTALL_ADDRESS_UNPARSEABLE: "설치 주소에 시/도와 시/군/구를 포함해 입력해 주세요.",
  INSTALL_DATE_INVALID: "설치일을 올바른 날짜로 입력해 주세요.",
  INSTALL_DATE_OUT_OF_RANGE: `설치일은 오늘 기준 ${INSTALL_DATE_MIN_DAYS_AHEAD}일 뒤부터 ${INSTALL_DATE_MAX_DAYS_AHEAD}일 뒤까지만 선택할 수 있습니다.`,
  CUSTOMER_PHONE_REQUIRED: "연락처를 입력해 주세요.",
  CUSTOMER_PHONE_IS_SAFE_NUMBER: SAFE_NUMBER_MESSAGE,
  CUSTOMER_PHONE_NOT_MOBILE: NOT_MOBILE_MESSAGE,
  // CJ 채널(공개 페이지). 주문번호가 명단에 없을 때는 "없는 번호"라고 단정하지
  // 않는다 — 실제로는 CJ 의 명단 업로드가 아직 안 된 경우가 대부분이다.
  CJ_ORDER_NO_NOT_FOUND:
    "주문번호를 확인해 주세요. 배송 완료 후 등록까지 시간이 걸릴 수 있습니다.",
  CJ_ORDER_NO_ALREADY_USED:
    "이미 접수된 주문번호입니다. 변경이 필요하시면 CJ 고객센터로 문의해 주세요.",
  ORDERER_PHONE_REQUIRED: "주문자 휴대폰 번호를 입력해 주세요.",
  ORDERER_PHONE_INVALID: "주문자 휴대폰 번호를 다시 확인해 주세요.",
  INTERNAL_ERROR: "일시적으로 제출할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

export function getInstallationCustomerRequestErrorMessage(error: string) {
  return CUSTOMER_REQUEST_ERROR_MESSAGES[error] ?? CUSTOMER_REQUEST_ERROR_MESSAGES.INTERNAL_ERROR;
}
