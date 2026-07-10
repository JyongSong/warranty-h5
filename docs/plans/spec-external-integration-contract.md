# 설치 배정 외부 연동 계약서

> 목적: 설치 배정 기능이 외부 시스템과 주고받는 조회 조건, payload, SMS 변수, Cron 실행 계약을 정의한다.
> 범위: ERP 주문 조회, Solapi SMS 템플릿 변수, Vercel Cron 경로/주기/권한.

## 1. ERP 주문 조회 계약

### 1.1 연결 환경변수

| 환경변수 | 필수 | 설명 |
|---|---|---|
| `ERP_SERVER` | 예 | ERP MSSQL host |
| `ERP_PORT` | 아니오 | ERP MSSQL port. 기본값 `2023` |
| `ERP_USER` | 예 | ERP DB 사용자 |
| `ERP_PASSWORD` | 예 | ERP DB 비밀번호 |

고정 DB명은 `NEOE`다.

### 1.2 조회 기준

| 조건 | 값 |
|---|---|
| 회사 코드 | `CD_COMPANY = '1000'` |
| 주문일 기준 | `COALESCE(DT_ORDER_ON, DT_ORDER) >= today` |
| `today` 기준 | KST 오늘 날짜 |
| 설치 포함 키워드 | `안심설치`, `방문설치`, `설치포함` 중 하나 포함 |
| 설치/서비스 라인 | `SA_SOL.CD_ITEM = '00010'` 또는 `SA_SOL.CD_ITEM LIKE '00012%'`. 설치 주문 포함 여부 판별용 |
| 제품 라인 집계 | 설치/서비스 라인을 포함한 같은 `NO_SO`의 제품 라인을 `items_json` 문자열로 함께 반환 |
| 필수 고객 정보 | 고객명, 전화번호가 존재 |
| 주소 처리 | 원천 주문 주소로만 저장하며 고객 입력 요청 생성 시 실제 설치 주소로 복사하지 않음. T0+96h 미입력 폴백 시점에만 설치 주소로 사용 |
| 중복 기준 | ERP 주문번호 `NO_SO` / 저장 컬럼 `source_erp_order_no` |
| grouping 기준 | ERP 주문번호 단위 |

`DT_DUEDATE`는 설치 희망일로 사용하지 않는다. ERP 데이터에서 주문일과 같은 값인 경우가 많아 고객 설치 희망일로 신뢰하지 않는다.

### 1.3 제외하지 않는 조건

설치 포함 키워드가 하나라도 있으면 후보로 조회한다. 조회 SQL 단계에서는 별도 제외 키워드를 적용하지 않는다.

### 1.4 ERP 원천 필드와 내부 payload 매핑

| 내부 필드 | ERP 원천 | 설명 |
|---|---|---|
| `erp_order_no` | `SA_SOL.NO_SO` | ERP 주문번호 |
| `customer_name` | `CZ_SA_ORDER.NM_RECEIVE`, `CZ_SA_ORDER.NM_CUST`, `SA_SOL_DLV.NM_CUST_DLV`, `SA_SOL_DLV.NM_CUST` | 첫 번째 유효값 |
| `phone` | `CZ_SA_ORDER.NO_HP2`, `NO_HP1`, `NO_TEL2`, `NO_TEL1`, 배송 연락처 | 첫 번째 유효값 |
| `address` | `CZ_SA_ORDER.DC_ADDR1`, `SA_SOL_DLV.ADDR1 + ADDR2` | 첫 번째 유효값 |
| `external_order_numbers` | `SA_SOL.NO_ORDER_ON` | 외부 주문번호 목록 |
| `no_girl` | `SA_GIRL.NO_GIR` | 출고/배송 관련 번호 목록 |
| `order_date` | `DT_ORDER_ON`, `DT_ORDER` | 첫 번째 유효 주문일 |
| `memo` | 상품명/수량 조합 및 앱 설치 표식 | 관리자/기사 표시용 제품 요약. 처리 기준으로 재해석하지 않음 |
| `required_aqara_app_capability` | `CZ_SA_ORDER.PRODUCT_NAME` 앱 설치 표식 | ERP 조회 시 산정한 Aqara App 요구 등급 |
| `items_json` | `SA_SOL` 라인을 `FOR JSON PATH`로 집계 | 같은 ERP 주문번호의 전체 품목 JSON 문자열. 각 항목은 `item_code`, `item_name`, `quantity`를 포함. 앱 payload는 이 문자열을 별도 `items` 배열이나 대표 품목 필드로 펼치지 않음 |

저장 시 `items_json` 원문은 `source_items_json_text`에 보존한다. 시스템 처리 기준은 `source_items_json_text`에서 산정한 `required_capabilities`와 ERP 조회가 내려준 `required_aqara_app_capability`이다. 후속 배정 로직은 `source_memo`를 재해석하지 않는다.

### 1.5 ERP payload DB 저장 매핑

`GET /api/internal/cron/installation/sync-orders`는 ERP 조회 payload를 `installation_orders`에 신규 저장한다. 같은 `source_erp_order_no`가 이미 있으면 `createMany({ skipDuplicates: true })` 정책으로 새 row를 만들지 않는다.

| ERP payload | 저장 필드 | 저장 정책 |
|---|---|---|
| `erp_order_no` | `source_erp_order_no` | 중복 기준. 필수값 |
| `customer_name` | `source_customer_name_encrypted`, `source_customer_name_hash` | 평문 저장 금지. 암호문과 검색용 hash 저장 |
| `phone` | `source_phone_encrypted` | ERP 원천 전화번호를 저장한다. 11자리 휴대폰 번호로 정규화되면 정규화 값을 암호화하고, 정규화 실패 시에도 원천 전화번호 trim 값을 암호화 저장한다 |
| `phone` | `source_phone_hash` | 11자리 휴대폰 번호로 정규화되는 경우에만 검색용 hash 저장. 정규화 실패 시 `null` |
| `address` | `source_address_encrypted` | ERP 원천 주소 전체를 공백 정규화 후 암호화 저장 |
| `address` | `source_address_main_encrypted` | `splitInstallationSourceAddress` 결과의 `addressMain` 암호화 저장. 지번/도로명 본문까지의 주소 |
| `address` | `source_address_detail_encrypted` | `splitInstallationSourceAddress` 결과의 `addressDetail` 암호화 저장. 동/호 등 상세 주소 |
| `address` | `source_address1_encrypted` | `splitInstallationSourceAddress` 결과의 `address1` 암호화 저장. 시/도 + 시/군/구 단위 지역 |
| `address` | `source_address2_encrypted` | `splitInstallationSourceAddress` 결과의 `address2` 암호화 저장. `address1` 이후 나머지 주소 |
| `external_order_numbers` | `source_external_order_numbers` | ERP 외부 주문번호 목록 저장 |
| `no_girl` | `source_no_girl` | ERP 출고/배송 관련 번호 목록 저장 |
| `order_date` | `source_order_date` | ERP 주문일 저장. 고객 설치 희망일로 사용하지 않음 |
| `memo` | `source_memo` | 관리자/기사 표시용 제품 요약 저장. 배정 조건으로 재해석하지 않음 |
| `source_error_code` | `source_validation_error_code` | ERP payload 검증 결과 저장. 전화번호가 11자리 휴대폰 규칙에 맞지 않으면 `PHONE_11_DIGITS_REQUIRED` 저장 |
| `items_json` | `source_items_json_text` | ERP 품목 JSON 문자열 원문 저장 |
| `items_json` | `required_capabilities` | `source_items_json_text`를 파싱해 설치 능력 요구값 산정 후 JSON 문자열로 저장 |
| `required_aqara_app_capability` | `required_aqara_app_capability` | ERP 조회 단계에서 산정한 Aqara App 요구 등급 저장 |

주소 파싱은 저장 단계에서만 수행한다. 화면이나 ERP 조회 SQL에서 주소를 별도 필드로 만들지 않고, 저장 시 `splitInstallationSourceAddress(address)` 결과를 기준으로 전체 주소, 본문 주소, 상세 주소, 지역 주소를 각각 암호화해 보존한다.

### 1.6 payload 예시

ERP 조회 함수는 아래 shape의 배열을 반환한다.

```json
[
  {
    "erp_order_no": "ONS20260604942",
    "customer_name": "강지훈",
    "phone": "010-4222-6824",
    "address": "인천 연수구 송도문화로28번길 27 송도글로벌파크베르디움 203동 1204호",
    "order_date": "20260616",
    "external_order_numbers": "20260615-0000145",
    "no_girl": "ISU20260601974",
    "items_json": "[{\"item_code\":\"00012-1\",\"item_name\":\"용역 도어락 설치비(K100)\",\"quantity\":1},{\"item_code\":\"00010\",\"item_name\":\"용역 출장비\",\"quantity\":1}]",
    "memo": "[지니스펙트럼PICK_앱 설치] 용역 도어락 설치비(K100) x1 / 용역 출장비 x1",
    "required_aqara_app_capability": "DOORLOCK_AND_APP"
  }
]
```

### 1.7 저장 응답 계약

`GET /api/internal/cron/installation/sync-orders` 성공 응답:

```json
{
  "ok": true,
  "job": "installation/sync-orders",
  "fetchedCount": 10,
  "savedCount": 3
}
```

같은 `source_erp_order_no`가 이미 저장되어 있으면 새 row를 만들지 않는다.

## 2. Solapi SMS 템플릿 변수 계약

### 2.1 공통 전송 원칙

| 항목 | 값 |
|---|---|
| provider | Solapi |
| 발송 단위 | `installation_notifications` outbox |
| 템플릿 저장 형식 | JSON `{ "content": "..." }` |
| 템플릿 샘플 | `docs/sample-sms-template-*.json` |
| 변수 문법 | `{variableName}` |
| 필수 변수 누락 처리 | 발송 차단, `SMS_FAILED` 예외 처리 대상 |
| 선택 변수 누락 처리 | fallback 값 사용 |
| placeholder 잔존 처리 | 필수 변수 placeholder가 남으면 발송 차단 |
| 배정 요청 SMS 멱등/재시도 기준 | 배정 시도 ID |
| 비배정 SMS 멱등/재시도 기준 | 발송 대상 + 업무 이벤트 |
| 실패 처리 | SMS 실패가 업무 상태 전이를 rollback하지 않음. 배정 요청 SMS 실패는 해당 배정 시도 재시도/실패 정책을 따름 |

### 2.2 템플릿별 변수

| templateKey | 수신자 | 변수 | 필수 | fallback |
|---|---|---|---|---|
| `customer_reservation_link` | 고객 | `reservationUrl` | 예 | 없음 |
| `customer_reservation_reminder` | 고객 | `reservationUrl` | 예 | 없음 |
| `installer_assignment_request` | 설치 기사 | `responseUrl` | `responseUrl` 예 | 없음 |
| `customer_assignment_confirmed` | 고객 | `customerName` | 아니오 | `고객` |
| `installer_happycall_guide` | 설치 기사 | `customerName` | 아니오 | `고객` |

### 2.3 템플릿 원문 샘플

템플릿 본문 샘플은 아래 JSON 파일을 참고한다. 실제 발송 문구는 구현 파일 `src/lib/installation/notification/sms-template-*.json`에서 관리한다.

| templateKey | 샘플 파일 |
|---|---|
| `customer_reservation_link` | `docs/sample-sms-template-customer-reservation-link.json` |
| `customer_reservation_reminder` | `docs/sample-sms-template-customer-reservation-reminder.json` |
| `installer_assignment_request` | `docs/sample-sms-template-installer-assignment-request.json` |
| `customer_assignment_confirmed` | `docs/sample-sms-template-customer-assignment-confirmed.json` |
| `installer_happycall_guide` | `docs/sample-sms-template-installer-happycall-guide.json` |

### 2.4 변수 payload 예시

```json
{
  "templateKey": "installer_assignment_request",
  "to": "01098765432",
  "variables": {
    "responseUrl": "https://example.com/i/i/installer-token"
  }
}
```

## 3. Vercel Cron 계약

### 3.1 경로와 주기

| path | method | schedule | 역할 |
|---|---|---|---|
| `/api/internal/cron/installation/sync-orders` | `GET` | `*/30 * * * *` | ERP 설치 주문 조회 및 신규 주문 저장 |
| `/api/internal/cron/installation/dispatcher` | `GET` | `*/5 * * * *` | 저장 주문 처리, 리마인드/폴백, 후보 선정, timeout, 예외, pending SMS 발송 |

Vercel Cron schedule은 UTC 기준이다. 위 두 작업은 간격 기반이므로 KST 변환이 필요 없다.

### 3.2 인증

모든 Cron endpoint는 아래 header를 요구한다.

```text
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET`이 서버 환경변수에 없거나 header 값이 일치하지 않으면 `401 Unauthorized`를 반환한다.

### 3.3 Vercel 설정

`vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/internal/cron/installation/sync-orders",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/internal/cron/installation/dispatcher",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

필수 환경변수:

```text
CRON_SECRET
DATABASE_URL
DIRECT_URL
ERP_SERVER
ERP_PORT
ERP_USER
ERP_PASSWORD
```

### 3.4 수동 검증 요청

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<production-domain>/api/internal/cron/installation/sync-orders
```

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<production-domain>/api/internal/cron/installation/dispatcher
```

### 3.5 실패 응답

| status | error | 의미 |
|---:|---|---|
| `401` | `Unauthorized` | `CRON_SECRET` 누락 또는 header 불일치 |
| `500` | `ERP_DATA_SYNC_FAILED` | ERP 조회 또는 신규 주문 저장 실패 |
| `500` | `INTERNAL_DISPATCHER_FAILED` | dispatcher 내부 작업 실패 |
