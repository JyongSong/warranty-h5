# 설치 배정 운영 정책 상수

> 목적: 설치 배정 구현에서 enum, dispatcher 조건, 검증 조건, 테스트 fixture로 직접 참조해야 하는 필수 정책값만 정의한다.
> 기준 문서: `docs/plan/spec-feature-list.md`, `docs/plan/spec-candidate-policy.md`, `docs/plan/spec-flow-state.md`

## 1. 상태 enum

### 설치 예약 상태

| 값 | 의미 |
|---|---|
| `CUSTOMER_INPUT_SMS_REQUIRED` | 고객 설치 정보 입력 SMS 발송 필요 |
| `WAITING_CUSTOMER_INPUT` | 고객 설치 정보 입력 대기 |
| `READY_FOR_CANDIDATE_SELECTION` | 자동 후보 선정 가능 |
| `WAITING_ADMIN_REVIEW` | 후보 선정 완료, 관리자 승인 대기 |
| `WAITING_INSTALLER_RESPONSE` | 특정 설치 기사 응답 대기 |
| `INSTALLER_ASSIGNED` | 설치 기사 수락으로 배정 완료 |
| `CANCELLED` | 취소로 자동 진행 종료 |
| `COMPLETED` | 설치 완료 |

관리자 수동 처리 필요는 설치 예약 상태 enum이 아니라 `hasOpenIssue=true`, 열린 예외, 활성 배정 해제, 감사 이벤트로 표현한다.

### 배정 시도 유형

| 값 | 의미 | 거절/timeout 후 처리 |
|---|---|---|
| `AUTO` | 시스템 자동 배정 요청 | 차순위 자동 요청 진행 |
| `MANUAL_DIRECT` | 관리자 직접 지정 요청 | 열린 예외가 있는 수동 처리 필요로 복귀 |
| `ADMIN_RETRY` | 관리자 후보 선정 재실행 요청 | 열린 예외가 있는 수동 처리 필요로 복귀 |

### 배정 시도 상태

| 값 | 활성 여부 | 의미 |
|---|---|---|
| `WAITING_INSTALLER_RESPONSE` | 활성 | 요청 발송 성공 후 기사 응답 대기 |
| `SYSTEM_SMS_RETRY_PENDING` | 활성 | 요청 SMS 일시 실패 후 같은 배정 시도 재시도 대기 |
| `INSTALLER_ACCEPTED` | 종료 | 기사 수락 |
| `INSTALLER_REJECTED` | 종료 | 기사 거절 |
| `INSTALLER_RESPONSE_TIMED_OUT` | 종료 | 기사 응답 시간 초과 |
| `SYSTEM_SMS_FAILED` | 종료 | 요청 SMS 최종 실패 |
| `ADMIN_MANUAL_OVERRIDDEN` | 종료 | 관리자가 자동 진행을 수동 처리로 전환 |
| `ADMIN_COMPLETED` | 종료 | 관리자가 완료 처리하면서 활성 배정 시도 종료 |

## 2. 숫자 정책

| 상수 | 값 | 의미 |
|---|---:|---|
| `CUSTOMER_INPUT_REMINDER_AFTER_HOURS` | `72` | 고객 입력 링크 발송 후 미입력 리마인드 시점 |
| `CUSTOMER_INPUT_REMINDER_MAX_SENDS` | `1` | 고객 미입력 리마인드 최대 발송 횟수 |
| `CUSTOMER_INPUT_DEADLINE_HOURS` | `96` | 고객 미입력 시 주문 배송지 폴백 판단 시점 |
| `INSTALLER_RESPONSE_TIMEOUT_HOURS` | `24` | 배정 요청 SMS 발송 성공 후 기사 응답 제한 시간 |
| `INSTALL_DATE_MIN_LEAD_DAYS` | `2` | KST 기준 오늘로부터 최소 설치 희망일 |
| `INSTALL_DATE_MAX_LEAD_DAYS` | `30` | KST 기준 오늘로부터 최대 설치 희망일 |
| `MAX_AUTO_INSTALLER_REQUESTS_PER_RESERVATION` | `3` | 설치 예약 1건당 자동 요청 가능한 최대 기사 수 |
| `DUE_SOON_EXCEPTION_DAYS_BEFORE` | `1` | 일정 임박 예외 생성 기준일 |
| `DUE_SOON_EXCEPTION_TIME_KST` | `09:00` | 설치 희망 날짜 하루 전 예외 생성 기준 시각 |

모든 날짜, timeout, 일정 임박 판단은 KST 기준으로 계산한다.

## 3. 고객 입력과 폴백

| 정책 | 값 |
|---|---|
| 고객 필수 입력 | 설치 희망 날짜, 설치 방문 주소, 연락처 |
| 고객 선택 입력 | 메모 |
| 고객 입력 검증 실패 시 상태 전환 | 없음 |
| 고객 미입력 기한 초과 시 주소 폴백 | T0+96h 시점에 주문 배송지 주소를 설치 방문 주소로 사용 |
| 초기 고객 입력 요청 생성 시 원천 주문 주소/전화 사용 | 실제 설치 정보로 저장하지 않음 |
| 원천 주문 설치 희망 날짜 사용 | T0+96h 폴백 시점에 유효한 날짜만 허용 |
| 폴백 후 설치 희망 날짜와 주소가 유효함 | `READY_FOR_CANDIDATE_SELECTION` 전환 |
| 폴백 후 설치 정보 부족 | 상태 값 유지, `INSUFFICIENT_CUSTOMER_INFO` 예외 생성 |

## 4. 자동 요청 조건

자동 후보 선정은 아래 조건을 모두 만족할 때만 가능하다.

| 조건 | 값 |
|---|---|
| 설치 예약 상태 | `READY_FOR_CANDIDATE_SELECTION` |
| 활성 배정 시도 | 없음 |
| SMS 재시도 대기 | 아님 |
| 차단 상태 | `CANCELLED`, `COMPLETED` |

`READY_FOR_CANDIDATE_SELECTION` 상태라도 활성 배정 시도 상태가 `SYSTEM_SMS_RETRY_PENDING`이면 새 후보 선정, 새 자동 요청, 차순위 진행을 실행하지 않고 같은 배정 시도 SMS 재시도만 수행한다.

`WAITING_ADMIN_REVIEW` 상태에서는 관리자 승인 전까지 기사에게 배정 요청 SMS를 발송하지 않는다.

### 중복 방지와 SMS 멱등성

| 정책 | 값 |
|---|---|
| 설치 예약당 활성 배정 시도 | 최대 1개 |
| 동일 예약/동일 기사 중복 요청 | 금지 |
| 배정 요청 SMS 멱등 기준 | 배정 시도 ID |
| 비배정 SMS 멱등 기준 | 발송 대상 + 업무 이벤트 |
| 성공 처리된 배정 요청 SMS 자동 재발송 | 금지 |
| 배정 요청 SMS 재시도 범위 | 발송 실패로 기록된 같은 배정 시도 |
| 비배정 SMS 재시도 범위 | 같은 발송 대상 + 같은 업무 이벤트 |
| 모든 SMS 발송 실패 | 최초 발송과 자동 재시도 1회를 합쳐 최대 2회, 최종 실패 시 `SMS_FAILED` 예외 생성 |
| 모든 SMS 도달 실패 | 최초 발송 포함 최대 2회까지 재시도, 최종 실패 시 `SMS_FAILED` 예외 생성 |
| SMS 제공사 접수 완료 | `SENT`, 도달 결과 확인 대상 |
| SMS 도달 성공 확인 | `DELIVERED`, 도달 결과 확인 종료 |
| 도달 결과 확인 재시도 횟수 | 연속 미확인 또는 조회 API 실패만 집계, 정상 결과 또는 새 발송 시 0으로 초기화 |
| 자동 1순위 후보 선정 | `WAITING_ADMIN_REVIEW` 전환, 기사 SMS 미발송 |
| 자동 차순위 후보 선정 | `WAITING_ADMIN_REVIEW` 전환, 기사 SMS 미발송 |
| 관리자 승인 후 배정 요청 SMS 일시 실패 | `WAITING_ADMIN_REVIEW` 유지, 같은 배정 시도 `SYSTEM_SMS_RETRY_PENDING` 기록 |
| 배정 요청 SMS 최종 실패 | 배정 시도 `SYSTEM_SMS_FAILED` 종료, 열린 예외로 수동 처리 필요 표시, `SMS_FAILED` 예외 생성 |
| 고객 입력 링크 SMS 실패 | 같은 고객 요청/토큰으로 재발송, 최종 실패 시 상태 전이 rollback 없이 `SMS_FAILED` 예외 생성 |
| 고객 리마인드 SMS 실패 | 같은 고객 요청/토큰으로 재발송, 최종 실패 시 상태 전이 rollback 없이 `SMS_FAILED` 예외 생성 |
| 고객 배정 완료 SMS 실패 | 상태 전이 rollback 없음, `SMS_FAILED` 예외 생성 |
| 설치 기사 해피콜 안내 SMS 실패 | 상태 전이 rollback 없음, `SMS_FAILED` 예외 생성 |

## 5. 자동 요청 금지 사유 코드

| 코드 | 조건 |
|---|---|
| `MISSING_INSTALL_DATE` | 설치 희망 날짜 없음 |
| `INSTALL_DATE_TOO_SOON` | 설치 희망 날짜가 KST 기준 오늘로부터 2일 뒤보다 빠름 |
| `INSTALL_DATE_TOO_LATE` | 설치 희망 날짜가 KST 기준 오늘로부터 30일 뒤보다 늦음 |
| `UNPARSABLE_INSTALL_ADDRESS` | 설치 방문 주소를 표준 지역으로 파싱할 수 없음 |
| `UNMAPPED_PRODUCT_REQUIREMENT` | 제품을 설치 능력 요구사항으로 변환할 수 없음 |
| `NO_CAPABILITY_MATCH` | 필수 설치 능력을 충족하는 설치 기사 없음 |
| `NO_REGION_MATCH` | 지역 매칭 기준을 충족하는 설치 기사 없음 |
| `POLICY_DATA_ERROR` | 제품-설치 능력 매핑 등 정책 데이터 오류 |
| `DATA_INTEGRITY_ERROR` | 후보 선정 중 데이터 정합성 오류 |
| `AUTO_ATTEMPT_LIMIT_EXCEEDED` | 자동 요청 최대 3명 한도 초과 |
| `ACTIVE_ATTEMPT_EXISTS` | 활성 배정 시도 존재 |
| `SYSTEM_SMS_RETRY_PENDING` | 같은 배정 시도의 SMS 재시도 대기 중 |
| `STATUS_NOT_AUTO_REQUESTABLE` | 설치 예약 상태가 자동 요청 가능 상태가 아님 |

## 6. 후보 매칭과 정렬

### 후보 산정 전처리

| 정책 | 값 |
|---|---|
| 여러 제품의 필수 설치 능력 산정 | 합집합 |
| Aqara App 요구 등급 산정 | ERP 조회 단계에서 산정 후 저장 |
| 제품-설치 능력 매핑 원천 | ERP `items_json` 원문을 저장한 `source_items_json_text` |
| 제품-설치 능력 매핑 실패 | 열린 예외로 수동 처리 필요 표시 |
| 제품 요약 메모 사용 범위 | 표시용. 배정 조건 산정에는 사용하지 않음 |
| 지역 key 구성 | 표준 광역명 + 표준 시/구 |
| 주소 표준화 실패 | 열린 예외로 수동 처리 필요 표시 |
| 배송지 주소 폴백 표준화 | 고객 입력 주소와 동일 기준 적용 |
| 커튼류 제품 배정 | 본 단계 제외 |

### 지역 매칭 tier

| 값 | 우선순위 | 조건 |
|---|---:|---|
| `EXACT_DISTRICT` | `1` | 설치 예약 지역 key가 기사 서비스 지역에 정확히 포함됨 |
| `REGION_ONLY` | `2` | 정확한 시/구 매칭은 없지만 광역명이 같음 |

후보 포함 최소 tier는 `REGION_ONLY`다. 두 tier 모두 충족하지 못하면 후보에서 제외한다.

### 워크플로 정책/문구 파일

`docs/plans/workflow-*` 파일은 워크플로 문구/라벨 계약이다. 실제 런타임 값은 대응하는 구현 파일에서 관리한다.

| 문서 파일 | 구현 파일 |
|---|---|
| `docs/plans/label-installation-status.json` | `src/lib/installation/order-status/label-installation-status.json` |
| `docs/plans/label-installation-event.json` | `src/lib/installation/order-status/label-installation-event.json` |

### 후보 필터

| 조건 | 값 |
|---|---|
| 활성 기사만 포함 | `true` |
| 필수 설치 능력 모두 충족 | `true` |
| Aqara App 요구 등급 충족 | `true` |
| 이미 요청한 기사 제외 | `true` |
| 관리자가 제외한 기사 제외 | `true` |
| Aqara 허브 재고로 필터링 | `false` |

### 후보 정렬

| 순서 | 기준 | 방향 |
|---:|---|---|
| `1` | 지역 tier | `EXACT_DISTRICT` 우선 |
| `2` | 월간 배정 건수 | 적은 순 |
| `3` | 최근 요청 시각 | 오래된 순 |
| `4` | 설치 기사 ID | 안정 정렬 |

최근 요청 이력이 없는 기사는 최근 요청 시각이 가장 오래된 것으로 본다.

## 7. 관리자 예외 정책

| 정책 | 값 |
|---|---|
| 직접 지정 가능 조건 | 열린 예외가 있는 설치건 |
| 직접 지정 시 지역 정렬 우회 | 허용 |
| 직접 지정 시 월간 배정 건수 정렬 우회 | 허용 |
| 직접 지정 시 최근 요청 시각 정렬 우회 | 허용 |
| 비활성 기사 직접 지정 | 금지 |
| 필수 설치 능력 미충족 기사 직접 지정 | 금지 |
| Aqara App 요구 등급 미충족 기사 직접 지정 | 금지 |
| 지역 매칭 미충족 기사 직접 지정 | 수동 지정 사유 필요 |
| 직접 지정 요청 SMS 일시 실패 | 현재 상태 유지, 같은 배정 시도 `SYSTEM_SMS_RETRY_PENDING` 기록 |
| 직접 지정 요청 거절/timeout | 열린 예외가 있는 수동 처리 필요로 복귀 |
| 직접 지정 요청 SMS 최종 실패 | 배정 시도 `SYSTEM_SMS_FAILED` 종료, `SMS_FAILED` 예외 생성 |
| 직접 지정 요청 후 차순위 자동 진행 | 금지 |
| 직접 지정 요청의 동일 기사 중복 발송 | 금지 |
| 관리자 재실행 후 SMS 일시 실패 | 현재 상태 유지, 같은 배정 시도 `SYSTEM_SMS_RETRY_PENDING` 기록 |
| 관리자 재실행 후 SMS 최종 실패 | 배정 시도 `SYSTEM_SMS_FAILED` 종료, `SMS_FAILED` 예외 생성 |
| 관리자 재실행 요청 거절/timeout | 열린 예외가 있는 수동 처리 필요로 복귀 |
| 관리자 재실행 요청 후 차순위 자동 진행 | 금지 |
| 수동 처리 전환 가능 상태 | `READY_FOR_CANDIDATE_SELECTION`, `WAITING_ADMIN_REVIEW`, `WAITING_INSTALLER_RESPONSE` |
| 수동 처리 전환 시 활성 자동 배정 시도 | `ADMIN_MANUAL_OVERRIDDEN`으로 종료 |
| 관리자 완료 처리 | 현재 상태와 관계없이 `COMPLETED` 전환 |
| 완료 처리 중 활성 배정 시도 | `ADMIN_COMPLETED`로 종료 |
| 취소 불가 상태 | `COMPLETED`, `CANCELLED` |

## 8. 예외 코드

| 코드 | 생성 조건 |
|---|---|
| `NO_INSTALLER_CANDIDATE` | 필터링 결과 배정 가능한 설치 기사가 없음 |
| `INSTALLER_CANDIDATES_EXHAUSTED` | 자동 재시도 한도 안에서 모든 후보가 실패함 |
| `INSUFFICIENT_CUSTOMER_INFO` | 고객 입력과 주문 배송지 폴백으로도 후보 선정 정보가 부족함 |
| `SMS_FAILED` | 필수 SMS가 재시도 후에도 발송되지 않거나 도달하지 않음 |
| `DUE_SOON` | 설치 희망 날짜 하루 전 09:00 KST까지 `INSTALLER_ASSIGNED`, `COMPLETED`, `CANCELLED`가 아님 |

`DUE_SOON` 예외가 열린 설치 예약이 `INSTALLER_ASSIGNED`, `COMPLETED`, `CANCELLED` 상태가 되면 해당 예외를 해결 처리한다.
