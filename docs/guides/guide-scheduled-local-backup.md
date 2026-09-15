# 정기 로컬 백업 가이드

## 문서 목적

운영 Supabase(프로젝트 DB + 완료 사진 버킷)를 **매일 로컬 디스크로** 내려두는 절차를 정의한다.

migration 직전에 한 번 뜨는 임시 백업은 [guide-production-db-backup-restore.md](./guide-production-db-backup-restore.md) 가 다룬다.
이 문서는 "Supabase 계정/프로젝트 자체를 잃어도 데이터는 남는다" 를 목표로 하는 상시 백업이다.

## 왜 필요한가

Supabase 자체 백업은 이 프로젝트의 마지막 방어선이 되기 어렵다.

- 무료/Pro 플랜의 자동 백업은 보존 기간이 짧고, 백업이 Supabase 계정 안에 있다. 계정·프로젝트 사고(실수로 프로젝트 삭제, 결제 정지, 지역 장애)에는 함께 없어진다.
- Point-in-Time Recovery 는 별도 유료 애드온이다.
- 사람이 저지르는 사고(잘못된 `delete`, 잘못된 migration)는 몇 시간 뒤에 발견되는 일이 많다. 어제 시점 사본이 손에 있어야 비교라도 할 수 있다.

## 백업 대상과 범위

| 대상 | 포함 | 비고 |
| --- | --- | --- |
| `public` schema | 구조 + 데이터 | 업무 데이터 전체 |
| `auth` schema | 구조 + 데이터 | 관리자/고객 계정, 세션 |
| `storage` schema | 구조 + 데이터 | 객체 메타데이터 |
| `installation-photos` 버킷 | 파일 본체 | 설치/AS 완료 사진 |
| Vercel 환경변수, Supabase 프로젝트 설정 | ❌ 포함 안 됨 | 별도로 관리한다 |

현재 규모는 DB 23MB, 사진 10장 수준이라 1회 백업이 약 15초, 3MB 정도다.

## 준비 (1회)

PostgreSQL 클라이언트가 필요하다. 서버가 17.6 이므로 17 이상이어야 한다.

```bash
brew install libpq
```

`libpq` 는 keg-only 라서 PATH 에 붙지 않는다. 백업 스크립트가 `/opt/homebrew/opt/libpq/bin` 을 직접 찾으므로 PATH 설정은 필요 없다.

> 복구까지 정확히 같은 메이저 버전으로 맞추고 싶으면 `brew install postgresql@17` 을 쓴다. 스크립트는 17 이 있으면 그것을 먼저 쓴다.

## 수동 실행

```bash
npm run db:backup
```

옵션:

```bash
bash scripts/backup-supabase.sh --db-only        # 사진 버킷 건너뛰기
BACKUP_ROOT=/Volumes/ext/warranty-h5 npm run db:backup        # 외장 디스크로
KEEP_DAILY=30 npm run db:backup                  # 보관 회수 변경 (기본 14)
```

결과물은 `~/data_backup/warranty-h5/<YYYY-MM-DD_HHMM>/` 아래에 쌓인다.

| 파일 | 용도 |
| --- | --- |
| `db.dump` | `pg_restore` 로 복원하는 custom 포맷 전체 백업 |
| `schema.sql` | 사람이 읽고 `diff` 할 수 있는 구조 스냅샷 |
| `storage/` | 버킷 경로 그대로 내려받은 사진 |
| `manifest.txt` | 백업 시각, git commit, 파일별 SHA-256 |

보관 정책: **최근 14회분**을 남긴다(날짜가 아니라 실행 횟수 기준이다 — 하루에 두 번 돌리면 두 자리를 쓴다).
여기에 더해 **매월 1일 백업은 횟수와 무관하게 영구 보존**한다. 개수는 `KEEP_DAILY` 로 바꾼다.

## 중복은 어떻게 처리하는가

매일 뜨는 백업이라 같은 내용이 계속 쌓인다. 둘을 다르게 다룬다.

### DB 는 매일 전체 덤프 (중복 제거 안 함)

의도한 선택이다. 덤프 하나가 1.2MB 라서 14개를 다 들고 있어도 17MB 밖에 안 된다.
증분으로 얻는 몇 MB 보다, **어떤 날짜의 덤프든 다른 파일에 의존하지 않고 혼자서 복원된다**는 성질이 훨씬 값지다.
증분 체인은 중간 한 조각이 깨지면 그 뒤가 전부 못 쓰게 된다 — 백업에서 제일 피하고 싶은 성질이다.

DB 가 수 GB 로 커지면 그때 다시 볼 문제다. 지금은 아니다.

### 사진은 hard link 로 한 장만 저장한다

사진은 한번 올라오면 바뀌지 않고 계속 쌓이기만 한다. 그래서 매일 다시 받으면 Supabase 이그레스와 디스크를 양쪽으로 낭비한다.

그래서 백업할 때 **직전 백업에 같은 크기로 있는 사진은 내려받지 않고 hard link 로 잇는다**.

- 각 백업 디렉터리는 여전히 **완전한 스냅샷**으로 보인다. 링크인지 원본인지 신경 쓸 필요가 없다.
- 디스크에는 사진 한 장이 **한 번만** 저장된다.
- 오래된 백업을 지워도 안전하다. 남아 있는 스냅샷이 링크를 붙들고 있으므로 파일은 사라지지 않는다. 보관 중인 어떤 스냅샷도 참조하지 않게 된 사진만 실제로 해제된다.

확인된 동작:

```
1회차: 새로 내려받음 10 개, 스냅샷 3.2M, 디스크 증가분 3.2MB
2회차: 새로 내려받음 0 개 / 기존 링크 10 개, 스냅샷 3.2M, 디스크 증가분 1.4MB
        (= db.dump 1.2MB + schema.sql 0.2MB — 사진 몫은 0)
```

`manifest.txt` 의 `snapshot_size` 는 "완전한 사본으로 볼 때의 크기", `disk_added` 는 "이번에 디스크가 실제로 늘어난 양"이다.

## 용량 전망

| 항목 | 1회 | 비고 |
| --- | --- | --- |
| `db.dump` | 1.2MB | 매일 새로 쌓인다 (23MB DB 를 압축한 값) |
| `schema.sql` | 0.2MB | 매일 새로 쌓인다 |
| 사진 | 평균 92KB/장 | 새 사진만. 클라이언트에서 압축해 올라온다 |

- **매일 늘어나는 양**: 약 1.4MB + 그날 올라온 새 사진
- **최근 14회분 + 월초 스냅샷 유지 시**: 덤프 몫 약 20MB + 사진 누적분
- 설치 건당 사진 1~4장(평균 2~3장) 기준으로 **건당 약 250KB** 가 영구히 쌓인다고 보면 된다. 월 100건이면 월 25MB, 1년에 300MB 정도다.

즉 1년 뒤에도 백업 루트 전체가 수백 MB 수준이다. 디스크를 걱정할 규모가 아니다.

## 자동 실행 (launchd)

```bash
cp scripts/launchd/com.lumi.warranty.backup.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lumi.warranty.backup.plist
```

매일 **11:30 (KST)** 에 돈다. 시각은 plist 의 `StartCalendarInterval` 이 정한다.

```xml
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key><integer>11</integer>
  <key>Minute</key><integer>30</integer>
</dict>
```

새벽이 아니라 업무 시간대로 잡은 이유: 이 백업은 맥이 켜져 있어야 돈다. 새벽 3시로 잡으면 맥이 꺼져 있거나 잠든 동안 계속 밀린다. launchd 는 놓친 실행을 **다음에 깨어날 때 한 번** 따라잡지만(여러 번 몰아서 돌지는 않는다), 애초에 켜져 있을 시간에 도는 게 낫다.

시각을 바꾸려면 plist 를 고친 뒤 다시 등록한다.

```bash
launchctl bootout gui/$(id -u)/com.lumi.warranty.backup
cp scripts/launchd/com.lumi.warranty.backup.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lumi.warranty.backup.plist
```

맥의 전원 상태와 무관하게 돌려야 한다면 launchd 가 아니라 GitHub Actions 쪽으로 옮겨야 한다. 다만 그때는 덤프가 GitHub 을 거치므로 암호화가 필수다 — 개인정보가 들어 있다.

확인/해제:

```bash
launchctl kickstart -p gui/$(id -u)/com.lumi.warranty.backup   # 지금 한 번 실행
tail -f ~/data_backup/warranty-h5/backup.log                          # 로그
launchctl bootout gui/$(id -u)/com.lumi.warranty.backup        # 해제
```

## 백업 검증 (권장: 월 1회)

"백업이 있다" 와 "백업이 복원된다" 는 다른 이야기다. 한 달에 한 번은 실제로 복원해 본다.

```bash
# 1. 로컬 Postgres 17 을 띄운다
docker run --rm -d --name restore-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17

# 2. 백업을 붓는다 (auth/storage schema 는 로컬에 역할이 없어 일부 오류가 나는 게 정상이다)
/opt/homebrew/opt/libpq/bin/pg_restore \
  --dbname="postgresql://postgres:test@localhost:55432/postgres" \
  --no-owner --no-privileges --schema=public \
  ~/data_backup/warranty-h5/<날짜>/db.dump

# 3. 행 수를 확인한다
/opt/homebrew/opt/libpq/bin/psql "postgresql://postgres:test@localhost:55432/postgres" -c '
select
  (select count(*) from warranty_registrations) as warranty,
  (select count(*) from installation_orders)    as orders,
  (select count(*) from installers)             as installers;'

# 4. 정리
docker rm -f restore-test
```

## 운영 DB 로 복원할 때

복원은 쓰기 작업이다. 명령은 **운영자가 직접** 실행한다.

1. 트래픽을 멈춘다(또는 점검 모드).
2. 복원 직전 상태를 한 번 더 백업한다 — 되돌릴 자리를 남겨야 한다.
3. `pg_restore --clean --if-exists` 절차는 [guide-production-db-backup-restore.md](./guide-production-db-backup-restore.md) 4장을 따른다.
4. 사진은 DB 복원으로 돌아오지 않는다. `storage/` 의 파일을 `installation-photos` 버킷의 같은 경로로 다시 업로드해야 `storage.objects` 메타데이터와 맞는다.

## 보안

백업에는 고객 전화번호·주소, 기사 개인정보가 그대로 들어 있다.

- 백업 디렉터리는 `700` 으로 만들어진다. 다른 사용자 계정에서 읽히지 않는다.
- FileVault 를 켜 둔다. 디스크가 통째로 빠져나가는 경우가 실질적인 위험이다.
- 백업 파일을 git, 공유 드라이브, 메신저로 옮기지 않는다.
- 외부에도 한 부 두고 싶으면 암호화한 뒤 올린다(예: `age -r <공개키> db.dump > db.dump.age`).
