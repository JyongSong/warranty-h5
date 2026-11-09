const ADMIN_EDIT_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
  ORDER_NOT_FOUND: "주문을 찾을 수 없습니다.",
  EDIT_REASON_REQUIRED: "수정 사유를 입력해 주세요.",
  REVERT_REASON_REQUIRED: "취소 사유를 입력해 주세요.",
  NOTHING_CHANGED: "바뀐 내용이 없습니다.",
  // 예약 정보
  ORDER_NOT_EDITABLE: "기사에게 요청이 나간 뒤에는 예약 정보를 고칠 수 없습니다. 화면을 새로고침해 주세요.",
  CUSTOMER_REQUEST_NOT_FOUND: "고객이 제출한 예약 정보가 없습니다.",
  INSTALL_ADDRESS_REQUIRED: "설치 주소를 입력해 주세요.",
  INSTALL_ADDRESS_UNPARSEABLE: "주소에서 시/도·시/군/구를 읽지 못했습니다. 주소 검색으로 입력해 주세요.",
  INSTALL_DATE_INVALID: "설치일을 확인해 주세요.",
  CUSTOMER_PHONE_INVALID: "전화번호를 확인해 주세요.",
  CUSTOMER_PHONE_IS_SAFE_NUMBER: "050 안심번호는 만료되므로 고객 실제 휴대폰 번호를 입력해 주세요.",
  CUSTOMER_PHONE_NOT_MOBILE: "휴대폰 번호(010 등)를 입력해 주세요.",
  // 완료
  ORDER_NOT_COMPLETED: "설치 완료 상태가 아닙니다. 화면을 새로고침해 주세요.",
  COMPLETION_NOT_APPROVED: "기사 완료 등록을 승인한 건이 아닙니다(관리자 직접 완료·협력사 건은 해당 없음).",
  SETTLEMENT_PERIOD_NOT_OPEN: "이미 정산이 끝난 기간에 들어간 건이라 바꿀 수 없습니다. 정산 기간을 먼저 열어 주세요.",
  INVALID_CAPABILITY: "연동 결과를 확인해 주세요.",
  INVALID_AMOUNT: "금액을 확인해 주세요.",
  EXTRA_CLAIM_REASON_REQUIRED: "기타 청구 금액이 있으면 사유를 입력해 주세요.",
  EXTRA_CLAIM_REASON_TOO_LONG: "기타 청구 사유는 500자 이내로 입력해 주세요.",
  WALLPAD_BILLING_INVALID: "월패드 결제 방식을 확인해 주세요.",
  AGENT_PROXY_BASE_FEE_INVALID: "기본 출장비를 확인해 주세요.",
  NOT_AGENT_PROXY_COMPLETION: "총판 대행 건이 아닙니다.",
};

export function getAdminEditErrorMessage(code: string) {
  return ADMIN_EDIT_ERROR_MESSAGES[code] ?? `처리하지 못했습니다. (${code})`;
}
