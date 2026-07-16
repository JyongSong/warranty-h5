# DB 마이그레이션 가이드

## 문서 목적

이 문서는 `warranty-h5` 앱의 Supabase Postgres 연결, DB schema 적용, 백오피스 migration 리허설, 운영 적용 절차를 하나로 정리한다.

대상 상황:

- 새 Supabase 프로젝트를 앱에 연결한다.
- `main` 브랜치 기준 DB schema를 테스트 DB에 구성한다.
- `feat/backoffice` 브랜치의 `add_backoffice` migration을 적용한다.
- PR merge 후 운영자가 운영 DB에 migration을 적용한다.

주의:

- 운영 DB에서는 `DROP SCHEMA`, `prisma db push`, `prisma migrate reset`, `supabase db reset`을 실행하지 않는다.
- 운영 DB에는 데이터를 보존하는 migration만 적용한다.
- DB 초기화 절차는 삭제 가능한 테스트 DB에서만 사용한다.
- 실제 키와 DB 비밀번호가 들어간 `.env` 파일은 커밋하지 않는다.

## 1. Supabase 연결 값 준비

Supabase Dashboard에서 다음 값을 확인한다.

- Project URL: `https://<project-ref>.supabase.co`
- anon 또는 publishable key
- service role key
- Database password
- Transaction pooler connection string: 앱 런타임용, 보통 `:6543`
- Session pooler connection string: Prisma schema/migration용, 보통 `:5432`

`.env.example`을 복사해 환경별 `.env` 파일을 만든다.

```bash
cp .env.example .env
```

Supabase 관련 값 예시:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"

NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-or-publishable-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

함께 확인할 값:

- `PII_ENCRYPTION_KEY`: 개인정보 암호화 키
- `PII_HASH_KEY`: 개인정보 검색/매칭용 HMAC 키
- `NEXT_PUBLIC_BASE_URL`: 앱 기본 URL 및 SMS 링크용 URL
- `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER`: SMS 발송 설정
- `CRON_SECRET`: cron API 보호용 secret
- `INTERNAL_API_KEY`: 내부 SMS API 보호용 key

연결 대상이 맞는지 비밀번호를 출력하지 않고 확인한다.

```bash
node - <<'NODE'
const fs = require("fs");
const text = fs.readFileSync(".env", "utf8");
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) continue;
  const raw = match[1].trim().replace(/^['"]|['"]$/g, "");
  const url = new URL(raw);
  console.log(`${key}: ${url.protocol}//${url.hostname}:${url.port || "(default)"}${url.pathname}`);
}
NODE
```

## 2. Prisma 기본 확인

Prisma client와 schema를 확인한다.

```bash
npx prisma generate
npx prisma validate
```

DB 연결만 먼저 확인하려면 다음 명령을 실행한다.

```bash
npx prisma db pull --print
```

schema가 출력되면 `DIRECT_URL` 연결은 정상이다.

## 3. 테스트 DB 리허설

이 절차는 삭제 가능한 테스트 DB에서만 실행한다. 기존 `public` schema와 데이터가 모두 삭제된다.

### 3.1 브랜치 확인

최신 코드를 가져온다.

```bash
git fetch origin
```

기능 브랜치로 이동한다.

```bash
git switch feat/backoffice
git branch --show-current
```

실제 기능 브랜치명이 다르면 명령의 브랜치명을 바꿔 실행한다.

### 3.2 테스트 DB 초기화

다시 강조: 이 명령은 `.env`의 `DIRECT_URL`이 가리키는 DB의 `public` schema를 삭제한다.

```bash
cat > /tmp/reset-public.sql <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;
SQL

npx prisma db execute --file /tmp/reset-public.sql
```

### 3.3 `main` 브랜치 schema 반영

작업 중인 브랜치를 바꾸지 않기 위해 `main` 브랜치 내용을 임시 디렉터리에 풀어 테스트한다.

```bash
rm -rf /tmp/warranty-main-schema
mkdir -p /tmp/warranty-main-schema
git archive --format=tar main | tar -xf - -C /tmp/warranty-main-schema
ln -s "$(pwd)/node_modules" /tmp/warranty-main-schema/node_modules
```

`main` 브랜치의 Prisma schema를 테스트 DB에 반영한다.

```bash
cd /tmp/warranty-main-schema
npx prisma db push
cd -
```

### 3.4 `backoffice` migration 적용

기능 브랜치의 migration SQL을 실행한다.

```bash
npx prisma db execute \
  --file prisma/migrations/20260623000000_add_backoffice/migration.sql
```

성공하면 다음 메시지가 나온다.

```text
Script executed successfully.
```

### 3.5 DB 객체 검증

주요 테이블, 컬럼, 인덱스가 생성됐는지 확인한다.

```bash
node - <<'NODE'
const fs = require("fs");
const { Client } = require("pg");

function readEnv(name) {
  const text = fs.readFileSync(".env", "utf8");
  const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) throw new Error(`${name} missing in .env`);
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

async function main() {
  const client = new Client({ connectionString: readEnv("DIRECT_URL") });
  await client.connect();

  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'shipped_devices',
        'warranty_registrations',
        'installers',
        'backoffice_users',
        'installation_order_sources',
        'installation_orders',
        'installation_customer_requests',
        'installation_installer_assignment_attempts',
        'installation_notifications',
        'installation_issues'
      )
    order by table_name
  `);

  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'installers'
      and column_name in ('active', 'capabilities', 'service_areas', 'monthly_dispatch_count')
    order by column_name
  `);

  const indexes = await client.query(`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'installation_issues_one_open_per_type_idx',
        'installers_capabilities_gin_idx',
        'installers_service_areas_gin_idx'
      )
    order by indexname
  `);

  console.log("tables:", tables.rows.map((row) => row.table_name).join(", "));
  console.log("installer columns:", columns.rows.map((row) => row.column_name).join(", "));
  console.log("indexes:", indexes.rows.map((row) => row.indexname).join(", "));

  await client.end();

  if (tables.rows.length !== 10) throw new Error("missing expected tables");
  if (columns.rows.length !== 4) throw new Error("missing expected installer columns");
  if (indexes.rows.length !== 3) throw new Error("missing expected indexes");

  console.log("RESULT=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

성공 기준:

```text
RESULT=PASS
```

## 4. 운영 DB 적용

운영 DB에서는 reset하지 않는다. 운영 적용 전에는 [운영 DB 백업/복구 가이드](./guide-production-db-backup-restore.md)에 따라 백업을 먼저 생성한다.

### 4.1 운영 적용 전 확인

운영 환경에서 다음을 확인한다.

```bash
git branch --show-current
npx prisma validate
```

운영 DB의 migration 기록을 확인한다.

```bash
psql "$DIRECT_URL" -c '
select migration_name, finished_at
from "_prisma_migrations"
order by finished_at;
'
```

`_prisma_migrations` 테이블이 없거나 현재 저장소의 migration history와 맞지 않으면, 운영 담당자가 baseline/resolve 전략을 먼저 결정해야 한다.

### 4.2 권장 적용 방식

PR이 merge된 뒤 운영 DB에는 Prisma migration을 적용한다.

```bash
npx prisma migrate deploy
```

이 명령이 조직의 배포 파이프라인에 포함되어 있지 않다면, 앱 빌드만으로 DB schema는 반영되지 않는다. 운영 담당자가 별도 migration 적용 단계를 실행해야 한다.

### 4.3 Migration SQL 직접 적용이 필요한 경우

운영 migration history가 아직 정리되지 않아 `npx prisma migrate deploy`를 사용할 수 없다면, 운영 담당자는 아래 SQL 파일을 직접 적용할 수 있다.

```bash
npx prisma db execute \
  --file prisma/migrations/20260623000000_add_backoffice/migration.sql
```

이 migration은 운영 데이터를 보존하기 위해 다음 원칙으로 작성되어 있다.

- 기존 테이블 `shipped_devices`, `warranty_registrations`, `installers`는 재생성하지 않는다.
- 기존 테이블에는 필요한 컬럼과 인덱스만 추가한다.
- 새 백오피스/설치 배정 테이블만 새로 생성한다.
- enum, index, foreign key는 가능한 한 중복 적용에 안전하게 처리한다.

## 5. 운영 적용 후 확인

운영 DB에서 주요 객체를 확인한다.

```bash
psql "$DIRECT_URL" -c '
select table_name
from information_schema.tables
where table_schema = '\''public'\''
  and table_name in (
    '\''backoffice_users'\'',
    '\''installation_order_sources'\'',
    '\''installation_orders'\'',
    '\''installation_customer_requests'\'',
    '\''installation_installer_assignment_attempts'\'',
    '\''installation_notifications'\'',
    '\''installation_issues'\''
  )
order by table_name;
'
```

`installers`에 새 컬럼이 추가됐는지 확인한다.

```bash
psql "$DIRECT_URL" -c '
select column_name
from information_schema.columns
where table_schema = '\''public'\''
  and table_name = '\''installers'\''
  and column_name in (
    '\''active'\'',
    '\''capabilities'\'',
    '\''service_areas'\'',
    '\''monthly_dispatch_count'\''
  )
order by column_name;
'
```

주요 인덱스를 확인한다.

```bash
psql "$DIRECT_URL" -c '
select indexname
from pg_indexes
where schemaname = '\''public'\''
  and indexname in (
    '\''installation_issues_one_open_per_type_idx'\'',
    '\''installers_capabilities_gin_idx'\'',
    '\''installers_service_areas_gin_idx'\''
  )
order by indexname;
'
```

## 6. Supabase Auth 설정

백오피스 로그인은 `@supabase/ssr` 기반 Supabase Auth 이메일/비밀번호 세션을 사용한다.

Supabase Dashboard에서 다음을 설정한다.

1. Authentication > Providers > Email을 활성화한다.
2. 운영 환경에 `SUPABASE_SECRET_KEY`를 서버 전용 환경 변수로 설정한다.
   레거시 `SUPABASE_SERVICE_ROLE_KEY`도 호환되지만 새 secret key 사용을 권장한다.

Supabase Auth 사용자는 앱 권한과 별개다. 앱 내부 백오피스 권한은 `backoffice_users` 테이블의 `level` 값으로 결정된다.

관리자는 `/backoffice/settings/users`에서 이메일, 초기 레벨, 초기 비밀번호를 입력한다.
서버는 Supabase Auth Admin API의 `createUser()`를 `email_confirm: true`로 호출하고,
성공한 Auth user id와 앱 권한을 `backoffice_users`에 함께 저장한다. 앱 DB 저장이 실패하면
방금 생성한 Auth 사용자를 삭제해 두 시스템의 불일치를 보상한다.

사용자는 초기 비밀번호로 `/login`에서 로그인하고, 로그인 후 내 비밀번호 변경 메뉴에서
직접 비밀번호를 변경할 수 있다. 비밀번호 찾기 메일은 제공하지 않으며, 분실한 경우 관리자가
유저 관리 화면에서 새 비밀번호로 재설정한다. 따라서 현재 흐름에는 Custom SMTP나 Auth Redirect URL이 필요 없다.

로그인 성공 시 `src/lib/login/backofficeAuth.ts`가 다음 순서로 사용자를 연결한다.

1. Supabase Auth user id로 `backoffice_users.supabase_user_id`를 찾는다.
2. 없으면 이메일 해시가 같은 pending user를 찾고 연결한다.
3. pending user도 없으면 등록되지 않은 계정으로 로그인 세션을 제거하고 접근을 거절한다.

현재 앱 권한 기준:

- `level = 0`: 백오피스 접근 불가
- `level = 1`: 관리자 기능 접근 가능

Supabase Dashboard에서 직접 만든 기존 사용자는 같은 이메일의 미연결 앱 레코드가 있으면
첫 로그인 시 연결할 수 있다. 새 사용자는 백오피스 화면에서 생성하는 방식을 사용한다.

## 7. 앱 동작 확인

DB migration 후 앱 배포가 완료되면 다음 화면과 API를 확인한다.

- `/reg`: 설치 등록 데이터 저장
- `/login`: Supabase Auth 로그인
- `/backoffice`: 백오피스 진입
- `/backoffice/installations`: 설치 주문 목록
- `/backoffice/settings/users`: 백오피스 사용자 관리
- `/backoffice/settings/data-import/installers`: 설치기사 데이터 import
- 내부 cron API: `/api/internal/cron/installation/sync-orders`, `/api/internal/cron/installation/dispatcher`

운영 배포 전에 다음도 확인한다.

- Vercel 또는 배포 환경의 Environment Variables가 Supabase 프로젝트 값으로 설정되어 있다.
- `DATABASE_URL`은 transaction pooler `:6543`을 사용한다.
- `DIRECT_URL`은 session pooler `:5432`을 사용한다.
- `SUPABASE_SECRET_KEY`가 서버 환경에만 설정되어 있고 클라이언트 번들에 노출되지 않는다.
- 첫 관리자 사용자의 `backoffice_users.level`이 `1` 이상이다.
- `NEXT_PUBLIC_BASE_URL`이 앱 기본 URL 및 SMS 링크용 운영 도메인으로 설정되어 있다.
- 개인정보 암호화 키 `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`가 기존 운영 데이터와 호환되는 값인지 확인되어 있다.

문제가 발생하면 운영 DB 백업 파일로 복구할지, migration forward-fix를 적용할지 운영 담당자가 결정한다.
