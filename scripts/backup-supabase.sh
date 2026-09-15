#!/usr/bin/env bash
# Supabase 프로덕션 백업을 로컬 디스크로 내린다. 읽기 전용이다 — DB 에 아무것도 쓰지 않는다.
#
#   bash scripts/backup-supabase.sh              # DB + Storage 백업
#   bash scripts/backup-supabase.sh --db-only    # Storage 건너뛰기
#   BACKUP_ROOT=/Volumes/ext/warranty-h5 bash scripts/backup-supabase.sh   # 다른 위치로
#
# 필요한 것: pg_dump 17 이상 (brew install libpq), .env.local 의 DIRECT_URL
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/data_backup/warranty-h5}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.local}"
KEEP_DAILY="${KEEP_DAILY:-14}"   # 최근 몇 회분을 남길지. 매월 1일 백업은 이와 무관하게 보존한다
DB_ONLY=0
[[ "${1:-}" == "--db-only" ]] && DB_ONLY=1

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# 스냅샷 전체 크기 — hard link 로 이어진 사진도 포함해서 센다.
snapshot_size() { du -sh "$DEST" | cut -f1; }

# 이번 백업이 디스크에 실제로 더한 양 — 이 백업만 붙들고 있는 파일(link 수 1)의 합.
disk_added() {
  find "$DEST" -type f -links 1 -print0 \
    | xargs -0 stat -f '%z' 2>/dev/null \
    | awk '{ total += $1 } END { printf "%.1fMB", total / 1024 / 1024 }'
}

# --- pg_dump 찾기 (Postgres 17 이상이어야 한다) -------------------------------
find_pg_dump() {
  for candidate in \
    "${PG_DUMP:-}" \
    /opt/homebrew/opt/postgresql@17/bin/pg_dump \
    /opt/homebrew/opt/libpq/bin/pg_dump \
    /usr/local/opt/libpq/bin/pg_dump \
    "$(command -v pg_dump 2>/dev/null || true)"
  do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    local major
    major="$("$candidate" --version | sed -E 's/.* ([0-9]+).*/\1/')"
    if (( major >= 17 )); then echo "$candidate"; return 0; fi
  done
  return 1
}
PG_DUMP_BIN="$(find_pg_dump)" || die "pg_dump 17+ 가 없다. 먼저: brew install libpq"
PG_BIN_DIR="$(dirname "$PG_DUMP_BIN")"

# --- 접속 문자열 (세션 모드 5432 — pg_dump 는 트랜잭션 풀러 6543 에서 못 돈다) ---
read_env() { sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" "$ENV_FILE" | tail -1; }
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE 이 없다"
DB_URL="$(read_env DIRECT_URL)"
[[ -n "$DB_URL" ]] || die "$ENV_FILE 에 DIRECT_URL 이 없다"
[[ "$DB_URL" == *":6543"* ]] && die "DIRECT_URL 이 트랜잭션 풀러(6543)를 가리킨다. 5432 세션 포트가 필요하다"

STAMP="$(date '+%Y-%m-%d_%H%M')"
DEST="$BACKUP_ROOT/$STAMP"

# 직전 백업의 storage 디렉터리 — 사진을 다시 받지 않고 hard link 로 잇는 대상이다.
PREV_STORAGE=""
if [[ -d "$BACKUP_ROOT" ]]; then
  PREV_DIR="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' ! -path "$DEST" | sort -r | head -1)"
  [[ -n "$PREV_DIR" && -d "$PREV_DIR/storage" ]] && PREV_STORAGE="$PREV_DIR/storage"
fi

mkdir -p "$DEST"
chmod 700 "$BACKUP_ROOT" "$DEST"   # 개인정보가 들어간다

log "백업 대상: $DEST"
log "pg_dump: $("$PG_DUMP_BIN" --version)"

# --- 1. 데이터 포함 전체 덤프 (custom 포맷: pg_restore 로 선택 복원 가능) -----
log "DB 덤프 중…"
"$PG_DUMP_BIN" "$DB_URL" \
  --format=custom --compress=9 \
  --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$DEST/db.dump"

# --- 2. 사람이 읽고 diff 할 수 있는 스키마 스냅샷 ------------------------------
log "스키마 스냅샷 중…"
"$PG_DUMP_BIN" "$DB_URL" \
  --schema-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$DEST/schema.sql"

# --- 3. 덤프가 실제로 읽히는지 검증 -------------------------------------------
log "덤프 검증 중…"
TOC_LINES="$("$PG_BIN_DIR/pg_restore" --list "$DEST/db.dump" | grep -c ';' || true)"
(( TOC_LINES > 10 )) || die "덤프가 비어 있거나 깨졌다 (TOC $TOC_LINES 줄)"

# --- 4. Storage 버킷 (완료 사진) ----------------------------------------------
if (( DB_ONLY == 0 )); then
  if [[ -n "$PREV_STORAGE" ]]; then
    log "Storage 버킷 확인 중 (새 사진만 내려받고, 기존 사진은 $(basename "$(dirname "$PREV_STORAGE")") 에 hard link)…"
  else
    log "Storage 버킷 내려받는 중 (첫 백업 — 전체)…"
  fi
  ( cd "$PROJECT_DIR" && ENV_FILE="$ENV_FILE" \
      node scripts/backup-storage.mjs "$DEST/storage" "$PREV_STORAGE" )
else
  log "Storage 건너뜀 (--db-only)"
fi

# --- 5. 매니페스트 -------------------------------------------------------------
{
  echo "taken_at: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "git_commit: $(cd "$PROJECT_DIR" && git rev-parse --short HEAD)"
  echo "pg_dump: $("$PG_DUMP_BIN" --version)"
  echo "schemas: public, auth, storage"
  echo "snapshot_size: $(snapshot_size)"       # 이 백업을 완전한 사본으로 볼 때의 크기
  echo "disk_added: $(disk_added)"            # 이번에 디스크가 실제로 늘어난 양 (hard link 제외)
  echo "files:"
  ( cd "$DEST" && find . -type f ! -name manifest.txt -exec shasum -a 256 {} \; | sed 's/^/  /' )
} > "$DEST/manifest.txt"

# --- 6. 오래된 백업 정리 (매월 1일 백업은 보존) --------------------------------
log "오래된 백업 정리 중 (일별 $KEEP_DAILY 개 유지, 매월 1일은 보존)…"
kept=0
while IFS= read -r dir; do
  [[ -n "$dir" ]] || continue
  name="$(basename "$dir")"
  if [[ "$name" == *-01_* ]]; then continue; fi          # 월초 스냅샷은 남긴다
  kept=$((kept + 1))
  if (( kept > KEEP_DAILY )); then
    rm -rf "$dir"
    log "  삭제: $name"
  fi
done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort -r)

log "완료: $DEST — 스냅샷 $(snapshot_size), 디스크 증가분 $(disk_added)"
