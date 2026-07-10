# 운영 DB 백업/복구 가이드

## 문서 목적

이 문서는 운영 PostgreSQL DB에 Prisma migration을 적용하기 전, 테이블 구조와 데이터를 백업하고 문제가 생겼을 때 복구하는 절차를 정의한다.

대상 상황:

- 운영 DB에 새 migration을 적용하기 전
- migration 적용 중 오류가 발생해 이전 상태로 되돌려야 할 때
- DB reset이 아니라 운영 데이터를 보존해야 하는 배포 작업

## 1. 사전 확인

### 1.1 PostgreSQL CLI 확인

```bash
pg_dump --version
pg_restore --version
psql --version
```

`pg_dump`, `pg_restore`, `psql`이 실행되지 않으면 PostgreSQL client tools를 먼저 설치한다.

### 1.2 연결 문자열 확인

백업/복구에는 운영 DB direct connection URL을 사용한다.

```bash
echo "$DATABASE_URL"
```

주의:

- 운영 DB 연결 문자열은 터미널 출력, 문서, 커밋에 남기지 않는다.
- Supabase/호스팅 Postgres에서는 pooler URL보다 direct connection URL을 권장한다.
- 복구 명령은 기존 테이블을 삭제하고 백업 상태로 되돌릴 수 있으므로, 대상 DB가 운영 DB가 맞는지 반드시 확인한다.

### 1.3 적용된 migration 확인

운영 DB가 어떤 migration까지 적용했는지 먼저 확인한다.

```bash
psql "$DATABASE_URL" -c '
select migration_name, finished_at
from "_prisma_migrations"
order by finished_at;
'
```

예상 상태를 확인한 뒤 migration을 진행한다. 예를 들어 운영 DB가 `202603...` migration까지만 적용된 상태라면, 이후 migration 파일만 새로 적용되어야 한다.

## 2. 백업 생성

### 2.1 권장 백업 명령

테이블 구조, 인덱스, 제약조건, 데이터까지 포함하는 custom format 백업을 생성한다.

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --file=backup-before-migration-$(date +%Y%m%d-%H%M%S).dump
```

옵션 의미:

- `--format=custom`: `pg_restore`로 복구 가능한 압축 백업 형식
- `--clean`: 복구 시 기존 DB 객체를 삭제하는 명령을 백업에 포함
- `--if-exists`: 삭제 대상이 없을 때 오류를 줄임
- `--no-owner`: 백업 파일에 owner 복원 명령을 넣지 않음
- `--no-privileges`: 권한 복원 명령을 넣지 않음

### 2.2 백업 파일 확인

생성된 파일이 있는지 확인한다.

```bash
ls -lh backup-before-migration-*.dump
```

백업 파일 목록을 읽을 수 있는지도 확인한다.

```bash
pg_restore --list backup-before-migration-YYYYMMDD-HHMMSS.dump | head
```

`YYYYMMDD-HHMMSS`는 실제 생성된 파일명으로 바꾼다.

## 3. Migration 적용 전 최종 체크

현재 branch와 migration 파일 목록을 확인한다.

```bash
git status --short
find prisma/migrations -maxdepth 2 -type f | sort
```

Prisma schema가 유효한지 확인한다.

```bash
npx prisma validate
```

운영 DB에 migration을 적용하기 전에 백업 파일이 실제로 존재하고 읽히는 상태여야 한다.

## 4. 복구 절차

### 4.1 복구가 필요한 경우

다음 상황에서는 migration 적용을 중단하고 복구를 검토한다.

- migration 적용 중 실패했고 DB 상태가 불명확함
- migration은 성공했지만 앱에서 치명적인 오류가 발생함
- 데이터 이관 결과가 기대와 다름
- 운영자가 배포 전 상태로 되돌리기로 결정함

### 4.2 복구 명령

복구는 기존 DB 객체를 삭제하고 백업 파일의 상태로 되돌린다.

```bash
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  backup-before-migration-YYYYMMDD-HHMMSS.dump
```

주의:

- 이 명령은 기존 테이블과 데이터를 백업 시점으로 되돌린다.
- migration 이후 새로 들어온 운영 데이터는 사라질 수 있다.
- 복구 전에 서비스 트래픽을 멈추거나 maintenance 상태로 전환하는 것을 권장한다.

### 4.3 복구 후 확인

복구 후 migration 기록을 확인한다.

```bash
psql "$DATABASE_URL" -c '
select migration_name, finished_at
from "_prisma_migrations"
order by finished_at;
'
```

주요 테이블 row 수를 확인한다.

```bash
psql "$DATABASE_URL" -c '
select
  (select count(*) from installation_orders) as installation_orders,
  (select count(*) from installation_customer_requests) as installation_customer_requests,
  (select count(*) from backoffice_settings) as backoffice_settings;
'
```

앱이 사용하는 주요 화면과 API를 확인한 뒤 서비스를 정상화한다.

## 5. 보관 및 폐기

백업 파일은 migration 안정화가 확인될 때까지 안전한 위치에 보관한다.

권장:

- 파일명을 작업 일시와 목적이 드러나게 유지한다.
- 운영 DB 백업 파일을 Git에 커밋하지 않는다.
- 로컬 장비에만 두지 말고 필요한 경우 안전한 내부 저장소에 보관한다.
- 복구가 더 이상 필요 없다고 판단되면 운영 보안 정책에 따라 폐기한다.
