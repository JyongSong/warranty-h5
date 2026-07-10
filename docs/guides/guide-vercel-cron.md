# Vercel Cron Guide

## 대상 Cron

설치 기능은 두 개의 내부 Cron endpoint를 사용한다.

```text
GET /api/internal/cron/installation/sync-orders
GET /api/internal/cron/installation/dispatcher
```

`sync-orders` route는 다음 작업을 수행한다.

- ERP 설치 주문을 조회한다.
- `source_erp_order_no`가 아직 없는 주문만 `installation_orders`에 저장한다.
- 결과로 `fetchedCount`, `savedCount`를 반환한다.

`dispatcher` route는 다음 작업을 순서대로 수행한다.

- 처리 대기 설치 주문의 고객 입력 링크와 SMS outbox를 생성한다.
- 만료된 고객 입력 링크에 리마인드 SMS를 생성한다.
- 고객 미입력 96시간 경과 건을 주문 배송지 주소로 폴백하고 배정 가능 상태로 전환한다.
- 후보 선정 가능 주문의 기사 후보와 관리자 검토 배정을 생성한다.
- 만료된 기사 응답을 timeout으로 처리한다.
- 설치 희망일 3일 전까지 미확정 건에 예외를 생성한다.
- pending SMS outbox를 발송한다.
- Solapi SMS 배송 상태를 조회하고 도달 실패를 처리한다.

## 인증

요청에는 다음 header가 필요하다.

```text
Authorization: Bearer <CRON_SECRET>
```

Vercel 공식 가이드는 `CRON_SECRET` 환경변수를 만들고, route에서 `Authorization` header를 검증하는 방식을 안내한다. Vercel Cron은 이 값을 사용해 cron 요청에 다음 header를 보낸다.

```text
Authorization: Bearer <CRON_SECRET>
```

따라서 Vercel 프로젝트 환경변수와 로컬 `.env`에 `CRON_SECRET`을 설정해야 한다.

## 로컬 확인

1. 로컬 DB와 schema를 준비한다.

```bash
npx prisma db push
```

2. 개발 서버를 실행한다.

```bash
npm run dev
```

3. 별도 터미널에서 cron endpoint를 직접 호출한다.

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/internal/cron/installation/sync-orders
```

dispatcher endpoint:

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/internal/cron/installation/dispatcher
```

`sync-orders` 성공 응답 예시:

```json
{
  "ok": true,
  "job": "installation/sync-orders",
  "fetchedCount": 10,
  "savedCount": 3
}
```

`savedCount`는 신규 저장된 row 수다. 같은 ERP 주문이 이미 있으면 `createMany({ skipDuplicates: true })` 정책으로 저장하지 않는다.

## 운영 제어

Vercel Cron 자체는 계속 등록해 두고, API route 내부에서 DB 설정값을 확인해 실행 여부를 결정한다. 운영자가 재배포 없이 cron 동작을 멈추거나 다시 켤 수 있도록 `backoffice_settings` 테이블을 사용한다.

사용하는 설정 key:

```text
installation.syncOrders.enabled
installation.dispatcher.enabled
installation.sms.customerInputRequestMode
installation.dispatcher.lockTtlMs
installation.dispatcher.limit.processInstallationOrders
installation.dispatcher.limit.remindCustomerRequests
installation.dispatcher.limit.fallbackCustomerRequests
installation.dispatcher.limit.dispatchReadyOrders
installation.dispatcher.limit.timeoutInstallerAssignments
installation.dispatcher.limit.alertDueSoonOrders
installation.dispatcher.limit.sendInstallationNotifications
installation.dispatcher.limit.syncSmsDeliveryReports
installation.sms.deliveryMode
installation.sms.testPhoneNumber
```

cron 실행 여부 설정은 문자열 값 `'true'`인 row가 존재해야 실행한다. row가 없거나 `value = 'false'`이면 실제 작업을 수행하지 않고 다음 응답을 반환한다.

```json
{
  "ok": true,
  "job": "installation/dispatcher",
  "skipped": true,
  "reason": "CRON_DISABLED"
}
```

운영 중지:

```sql
update backoffice_settings
set value = 'false',
    updated_at = now(),
    updated_by = 'operator'
where key in (
  'installation.syncOrders.enabled',
  'installation.dispatcher.enabled'
);

update backoffice_settings
set value = 'disabled',
    updated_at = now(),
    updated_by = 'operator'
where key = 'installation.sms.deliveryMode';
```

운영 재개:

```sql
update backoffice_settings
set value = 'true',
    updated_at = now(),
    updated_by = 'operator'
where key in (
  'installation.syncOrders.enabled',
  'installation.dispatcher.enabled'
);

update backoffice_settings
set value = 'test',
    updated_at = now(),
    updated_by = 'operator'
where key = 'installation.sms.deliveryMode';
```

개별 job만 제어할 수도 있다.

```sql
update backoffice_settings
set value = 'false',
    updated_at = now(),
    updated_by = 'operator'
where key = 'installation.dispatcher.enabled';
```

설정 row가 없으면 안전 기본값으로 disabled로 간주한다. 운영 Supabase DB에는 다음 SQL로 기본 row를 생성한다.

```sql
create table if not exists public.backoffice_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.backoffice_settings ("key", "value", "updated_at", "updated_by")
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

`installation.sms.testPhoneNumber`에 여러 대체 수신 번호를 넣을 때는 `01012345678,01022223333`처럼 콤마, 세미콜론, 줄바꿈으로 구분한다.

`installation.sms.customerInputRequestMode`의 기본값은 `manual`이다. `manual`이면 고객 입력 요청은 주문 관리 화면에서 관리자가 선택 발송하고, dispatcher는 신규 고객 입력 요청 문자 생성을 건너뛴다. 자동 발송으로 운영하려면 값을 `auto`로 변경한다.

`installation.sms.deliveryMode`는 `disabled`이면 설치 문자 전체 발송 중지, `test`이면 `installation.sms.testPhoneNumber`로 대체 발송, `production`이면 실제 고객/기사 번호로 발송한다.

기존 활성 설치 기사의 기본 역량을 `DOORLOCK`, `WALLPAD_HUB` 및 Aqara 앱+허브 가능으로 보정하려면 다음 SQL을 적용한다.

```sql
update installers
set
  capabilities = array['DOORLOCK','WALLPAD_HUB']::text[],
  aqara_app_capability = 'DOORLOCK_AND_APP_AND_HUB',
  updated_at = now()
where active = true;
```

Supabase Dashboard에서는 프로젝트 선택 후 SQL Editor에서 위 SQL을 실행한다. SMS만 중지하려면 다음처럼 `installation.sms.deliveryMode`만 `disabled`로 바꾼다. 이 경우 자동 설치 SMS outbox는 기존 “SMS 발송 실패” 흐름으로 처리된다.

```sql
update backoffice_settings
set value = 'disabled',
    updated_at = now(),
    updated_by = 'operator'
where key = 'installation.sms.deliveryMode';
```

### Dispatcher 실행 lock

`dispatcher`는 5분마다 실행되며, 중복 실행을 막기 위해 `cron_job_run_locks` 테이블을 사용한다. 실행 시작 시 `installation.dispatcher` lock을 4분 동안 잡고, 이미 다른 실행이 유효한 lock을 가지고 있으면 실제 작업을 수행하지 않는다.

lock 중복으로 skip되면 다음 응답을 반환한다.

```json
{
  "ok": true,
  "job": "installation/dispatcher",
  "skipped": true,
  "reason": "JOB_LOCKED"
}
```

lock은 `locked_by` owner token으로 해제한다. 따라서 이전 실행이 늦게 끝나더라도, 그 사이 새 실행이 획득한 lock을 잘못 해제하지 않는다.

### Dispatcher 처리량 제한

`dispatcher`는 한 번 실행에서 단계별 처리 개수를 제한한다. 대량 backlog가 생겨도 하나의 Vercel Function 실행이 과도하게 길어지지 않도록 작은 batch를 반복 처리하는 구조다.

기본값과 허용 범위는 `src/lib/installation/installer/dispatcher-config.json`에 있고, 운영 적용값은 `backoffice_settings`에서 같은 key를 읽어 override한다. 설정 row가 없거나 숫자 값이 허용 범위를 벗어나면 JSON 기본값을 사용한다.

| 단계 | limit |
|---|---:|
| 신규 설치 주문 처리 | 25 |
| 고객 입력 리마인드 생성 | 25 |
| 고객 미입력 폴백 처리 | 25 |
| 기사 후보 선정/배정 요청 생성 | 25 |
| 기사 응답 timeout 처리 | 25 |
| 설치 일정 임박 이슈 생성 | 50 |
| pending SMS 발송 | 10 |
| Solapi SMS 배송 상태 조회 | 25 |

응답과 Vercel Function log에는 단계별 `durationMs`가 포함된다. 특정 단계의 실행 시간이 지속적으로 길어지거나 `JOB_LOCKED`가 반복되면 해당 단계의 limit을 낮추거나 cron을 분리한다.

### SMS 도달 실패 처리

dispatcher는 pending SMS 발송 후 Solapi 배송 상태를 조회한다. 모든 설치 SMS의 도달 실패는 최초 발송 포함 최대 2회까지 같은 업무 대상 기준으로 재발송하고, 최종 실패하면 SMS 실패 예외를 만든다.

기사 배정 요청 SMS 최종 도달 실패는 활성 배정 시도를 `SYSTEM_SMS_FAILED`로 종료해 수동 처리 필요 상태로 만든다. 비배정 SMS 최종 도달 실패는 업무 상태를 되돌리지 않고 SMS 실패 예외로 관리한다.

## 로컬 DB 확인

중복 저장 여부:

```sql
select
  source_erp_order_no,
  count(*)
from installation_orders
group by source_erp_order_no
having count(*) > 1;
```

기대 결과:

```text
0 rows
```

최근 저장 주문 확인:

```sql
select
  source_erp_order_no,
  source_customer_name,
  source_phone,
  source_order_date,
  source_items_json_text,
  required_capabilities,
  required_aqara_app_capability,
  created_at
from installation_orders
order by created_at desc
limit 20;
```

## Vercel 설정

`vercel.json`:

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

`*/30 * * * *`는 30분마다, `*/5 * * * *`는 5분마다 실행한다. Vercel Cron schedule은 UTC 기준이다. 간격 작업은 KST 변환이 필요 없지만, 특정 한국 시각에 실행하는 작업은 UTC로 변환해서 작성한다.

Vercel 프로젝트 환경변수:

```text
CRON_SECRET
DATABASE_URL
DIRECT_URL
ERP_SERVER
ERP_PORT
ERP_USER
ERP_PASSWORD
```

## Vercel 배포 후 확인

1. Production deployment에 `vercel.json`이 포함되어 있는지 확인한다.
2. Vercel Dashboard의 Cron Jobs 화면에서 `/api/internal/cron/installation/sync-orders`, `/api/internal/cron/installation/dispatcher`가 등록됐는지 확인한다.
3. Functions 또는 Logs 화면에서 cron 실행 로그를 확인한다.
4. 필요하면 production URL에 직접 호출해 수동 검증한다.

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

## 실패 시 확인 순서

1. `401 Unauthorized`
   - `CRON_SECRET` 환경변수 누락 또는 header 불일치다.

2. `500 ERP_DATA_SYNC_FAILED`
   - Vercel function log에서 `[cron/installation/sync-orders]` 로그를 확인한다.
   - ERP 접속 환경변수와 네트워크 접근 가능 여부를 확인한다.
   - `DATABASE_URL`이 production DB를 가리키는지 확인한다.

3. `500 INTERNAL_DISPATCHER_FAILED`
   - Vercel function log에서 `[cron/installation/dispatcher]` 로그를 확인한다.
   - DB 연결, SMS 설정, 고객/기사 token 처리, 후보 선정 데이터 상태를 확인한다.

4. `savedCount`가 계속 `0`
   - 신규 ERP 주문이 없으면 정상이다.
   - `fetchedCount`도 `0`이면 ERP fetch 조건 또는 날짜 기준을 확인한다.

5. `200` 응답이지만 `reason`이 `CRON_DISABLED`
   - `backoffice_settings`에서 해당 job key row가 없거나 `value`가 `false`다.
   - 운영 중지 의도라면 정상이다. 재개하려면 값을 `true`로 변경한다.

6. `200` 응답이지만 `reason`이 `JOB_LOCKED`
   - 이전 dispatcher 실행이 아직 끝나지 않았거나, lock TTL 안에 다른 실행이 먼저 시작된 상태다.
   - 짧게 반복되는 경우는 정상적인 중복 실행 방지다.
   - 계속 반복되면 `cron_job_run_locks`의 `locked_until`, `locked_by`, `updated_at` 값을 확인하고 dispatcher 로그에서 장시간 실행 원인을 찾는다.

## 참고

- Vercel Cron Jobs 공식 문서: https://vercel.com/docs/cron-jobs
- Vercel Cron Jobs 관리 문서: https://vercel.com/docs/cron-jobs/manage-cron-jobs
