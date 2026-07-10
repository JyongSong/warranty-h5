# System Settings 기본값 등록

`backoffice_settings` 테이블에는 코드에서 사용하는 시스템 설정 값을 저장한다.

설치 dispatcher limit과 lock 설정은 `src/lib/installation/installer/dispatcher-config.json` 기준이며, 설치 SMS 발송 설정은 `src/lib/backoffice/system-settings.ts`의 `SYSTEM_SETTING_KEYS` 기준이다.

## SQL

```sql
insert into public.backoffice_settings ("key", "value", "created_at", "updated_at", "updated_by")
values
  ('installation.syncOrders.enabled', 'true', now(), 'operator'),
  ('installation.dispatcher.enabled', 'true', now(), 'operator'),
  ('installation.dispatcher.lockTtlMs', '240000', now(), 'operator'),
  ('installation.dispatcher.limit.processInstallationOrders', '25', now(), 'operator'),
  ('installation.dispatcher.limit.remindCustomerRequests', '25', now(), 'operator'),
  ('installation.dispatcher.limit.fallbackCustomerRequests', '25', now(), 'operator'),
  ('installation.dispatcher.limit.dispatchReadyOrders', '10', now(), 'operator'),
  ('installation.dispatcher.limit.timeoutInstallerAssignments', '25', now(), 'operator'),
  ('installation.dispatcher.limit.alertDueSoonOrders', '50', now(), 'operator'),
  ('installation.dispatcher.limit.sendInstallationNotifications', '10', now(), 'operator'),
  ('installation.dispatcher.limit.syncSmsDeliveryReports', '25', now(), 'operator'),
  ('installation.sms.customerInputRequestMode', 'manual', now(), 'operator'),
  ('installation.sms.deliveryMode', 'test', now(), 'operator'),
  ('installation.sms.testPhoneNumber', '01012345678', now(), 'operator')
on conflict ("key") do update
set
  "value" = excluded."value",
  "updated_at" = now(),
  "updated_by" = excluded."updated_by";
```

## 키 설명

| key | 설명 |
| --- | --- |
| `installation.syncOrders.enabled` | 설치 주문 동기화 cron 실행 여부 |
| `installation.dispatcher.enabled` | 설치 dispatcher cron 실행 여부 |
| `installation.sms.customerInputRequestMode` | 고객 입력 요청 문자 발송 방식. `manual`이면 주문 관리에서 관리자가 선택 발송하고, `auto`이면 dispatcher가 자동 발송 |
| `installation.dispatcher.lockTtlMs` | 설치 dispatcher 실행 lock 유지 시간(ms) |
| `installation.dispatcher.limit.processInstallationOrders` | 신규 설치 주문 최대 처리 건수 |
| `installation.dispatcher.limit.remindCustomerRequests` | 고객 입력 리마인드 생성 최대 처리 건수 |
| `installation.dispatcher.limit.fallbackCustomerRequests` | 고객 미입력 폴백 최대 처리 건수 |
| `installation.dispatcher.limit.dispatchReadyOrders` | 기사 후보 선정/배정 요청 생성 최대 처리 건수 |
| `installation.dispatcher.limit.timeoutInstallerAssignments` | 기사 응답 timeout 최대 처리 건수 |
| `installation.dispatcher.limit.alertDueSoonOrders` | 설치 일정 임박 이슈 생성 최대 처리 건수 |
| `installation.dispatcher.limit.sendInstallationNotifications` | pending 설치 SMS 발송 최대 처리 건수 |
| `installation.dispatcher.limit.syncSmsDeliveryReports` | Solapi SMS 배송 상태 조회 최대 처리 건수 |
| `installation.sms.deliveryMode` | 설치 문자 발송 상태. `disabled`, `test`, `production` 중 하나 |
| `installation.sms.testPhoneNumber` | `deliveryMode=test`일 때 사용할 테스트 수신 번호. 여러 번호는 콤마, 세미콜론, 줄바꿈으로 구분 |

## 참고

- `value` 컬럼은 현재 문자열 값이다. boolean 설정은 `'true'`, `'false'` 문자열로 저장한다.
- 고객 입력 요청 문자 발송 방식는 기본값이 `'manual'`이다. 자동 발송으로 운영하려면 `installation.sms.customerInputRequestMode`를 `'auto'`로 변경한다.
- dispatcher limit과 lock TTL 설정은 숫자 문자열로 저장한다. 설정 row가 없거나 허용 범위를 벗어나면 `src/lib/installation/installer/dispatcher-config.json`의 기본값을 사용한다.
- `installation.sms.deliveryMode`는 `disabled`이면 설치 문자 전체 발송 중지, `test`이면 `installation.sms.testPhoneNumber`로 대체 발송, `production`이면 실제 고객/기사 번호로 발송한다.
- 대체 수신 번호를 여러 개로 지정하려면 `01012345678,01022223333` 또는 줄바꿈으로 구분해서 저장한다.
- 운영에서 실제 고객/기사 번호로 발송하려면 `installation.sms.deliveryMode`를 `'production'`으로 변경한다.

## 설치 기사 기본 능력 보정

기존 활성 설치 기사의 기본 역량을 `DOORLOCK`, `WALLPAD_HUB` 및 Aqara 앱+허브 가능으로 보정하려면 다음 SQL을 적용한다.

```sql
update installers
set
  capabilities = array['DOORLOCK','WALLPAD_HUB']::text[],
  aqara_app_capability = 'DOORLOCK_AND_APP_AND_HUB',
  updated_at = now()
where active = true;
```

## 데이터 가져오기 엑셀 컬럼 매핑

백오피스의 `데이터 가져오기` 화면은 엑셀/CSV 헤더명을 코드의 저장 컬럼명에 매핑해서 저장한다.

매핑 파일은 아래 파일이다.

| 기능 | 매핑 파일 |
| --- | --- |
| 설치 기사 데이터 가져오기 | `src/lib/backoffice/installer-import-column-map.json` |

JSON의 key는 데이터베이스 저장 컬럼 기준이다. value는 엑셀/CSV 파일의 헤더명이다.

현재 설치 기사 기본 매핑은 아래와 같다. 배열은 앞에서부터 값이 있는 첫 번째 헤더를 사용한다.

| 저장 컬럼 | 엑셀/CSV 헤더 후보 |
| --- | --- |
| `name` | `성명`, `지정명` |
| `phone` | `전화번호` |
| `branch` | `지점`, `지정명` |
| `region` | `광역`, `지역` |
| `coverage` | `지역` |
| `address` | `주소`, `지역` |
| `category` | `소속 조직`, `분류`, `연동` |

같은 엑셀 헤더 값을 여러 저장 컬럼에 넣을 수도 있다.

```json
{
  "name": "지점명",
  "phone": "전화번호",
  "branch": "지점명"
}
```

엑셀 파일마다 헤더명이 다를 수 있으면 후보 헤더를 배열로 넣는다. 앞에서부터 값이 있는 첫 번째 헤더를 사용한다.

```json
{
  "name": ["성명", "지정명"],
  "branch": ["지점", "지정명"]
}
```

매핑 파일에 없는 저장 컬럼은 import row에 포함하지 않는다. 설치 기사의 필수 컬럼은 `name`, `phone`이며, 필수 값이 없으면 해당 행은 제외된다.

수정 절차:

1. 엑셀/CSV 파일의 실제 헤더명을 확인한다.
2. 위 JSON 파일에서 저장할 DB 컬럼 key의 value를 실제 헤더명으로 수정한다.
3. 저장하지 않을 optional 컬럼은 JSON에서 해당 key를 제거한다.
4. 배포 전에 `npm test -- src/lib/backoffice/data-import.test.ts src/app/backoffice/settings/data-import/actions.test.ts`로 import 파서와 저장 payload를 확인한다.
