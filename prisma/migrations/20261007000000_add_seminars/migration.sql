-- 기사 대상 세미나 참석 신청. Additive only — safe to run on production.
-- Run in Supabase SQL editor (prod DB is managed by hand; do NOT prisma db push).

-- 1) 세미나. 공개 화면(/i/s/{slug})에 보이는 안내 문구를 전부 여기에 둔다.
CREATE TABLE IF NOT EXISTS "seminars" (
  "id"              TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "slug"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "schedule_text"   TEXT NOT NULL,
  "venue"           TEXT NOT NULL,
  "venue_note"      TEXT,
  "attendance_note" TEXT,
  "program_items"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "parking_info"    TEXT,
  "contact_name"    TEXT,
  "contact_phone"   TEXT,
  "capacity"        INTEGER NOT NULL,
  "closes_at"       TIMESTAMPTZ(6),
  "manually_closed" BOOLEAN NOT NULL DEFAULT false,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "seminars_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "seminars_slug_key" ON "seminars" ("slug");

-- 2) 참석 신청. 기사 한 명은 세미나마다 행 하나 — 취소는 cancelled_at 을 채우고,
--    재신청은 같은 행을 되살린다. 정원은 cancelled_at 이 빈 행만 센다.
CREATE TABLE IF NOT EXISTS "seminar_registrations" (
  "id"            TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "seminar_id"    TEXT NOT NULL,
  "installer_id"  TEXT NOT NULL,
  "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "cancelled_at"  TIMESTAMPTZ(6),
  "cancelled_by"  TEXT,
  CONSTRAINT "seminar_registrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seminar_registrations_seminar_id_fkey"
    FOREIGN KEY ("seminar_id") REFERENCES "seminars" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "seminar_registrations_installer_id_fkey"
    FOREIGN KEY ("installer_id") REFERENCES "installers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "seminar_registrations_seminar_id_installer_id_key"
  ON "seminar_registrations" ("seminar_id", "installer_id");
CREATE INDEX IF NOT EXISTS "seminar_registrations_seminar_id_cancelled_at_idx"
  ON "seminar_registrations" ("seminar_id", "cancelled_at");
CREATE INDEX IF NOT EXISTS "seminar_registrations_installer_id_idx"
  ON "seminar_registrations" ("installer_id");

-- 3) 기존 방침대로 서버 전용으로 잠근다(default-deny + Data API 차단).
ALTER TABLE IF EXISTS "seminars"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "seminar_registrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "seminars",
  "seminar_registrations"
FROM anon, authenticated;

-- 4) 10/17 파트너 세미나. 안내 문자는 "선착순 30명" 이지만 실제 정원은 35명이고,
--    접수는 10/16 16:00(KST)에 닫힌다. 다시 실행해도 이미 있으면 건드리지 않는다.
INSERT INTO "seminars" (
  "slug", "title", "description", "schedule_text", "venue", "venue_note",
  "attendance_note", "program_items", "parking_info",
  "contact_name", "contact_phone", "capacity", "closes_at"
) VALUES (
  '1017',
  '아카라 도어락 파트너 세미나',
  '아카라 도어락 파트너분들을 대상으로 신제품 L100SE 소개와 신규 서비스 안내, 스마트홈 제품 실습을 함께하는 파트너 세미나를 진행합니다.',
  '10월 17일(토) 09:00~12:00',
  '서울시 금천구 대륭테크노타운 6차 702호',
  '가산디지털단지역 인근',
  '선착순 30명 (업체당 1명)',
  ARRAY[
    'L100SE 신모델 및 도어락 운영방향 안내',
    '설치기사 배정 서비스 안내',
    '현장 설치 유의사항 및 Q&A',
    '도어락 × 스마트홈 연동 실습',
    '전동커튼 및 아카라 조명 설치·운영 실습'
  ],
  '30분당 1,000원 · 종일권 10,000원',
  '김시열',
  '01099614937',
  35,
  '2026-10-16 16:00:00+09'
)
ON CONFLICT ("slug") DO NOTHING;
