-- 기사 분포 지도와 배정 화면 거리 표시.
-- 기사 좌표, 고객 주소 좌표 캐시, 기사-고객 자동차 거리 캐시를 추가한다.
-- 코드 배포 전에 먼저 실행해야 한다. installers 전체 컬럼을 읽는 조회가 있다.

ALTER TABLE "installers"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "geocoded_address" TEXT,
  ADD COLUMN IF NOT EXISTS "geocoded_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "address_geocode_cache" (
  "address_hash" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "address_geocode_cache_pkey" PRIMARY KEY ("address_hash")
);

CREATE TABLE IF NOT EXISTS "installer_driving_distances" (
  "installer_id" TEXT NOT NULL,
  "customer_address_hash" TEXT NOT NULL,
  "installer_latitude" DOUBLE PRECISION NOT NULL,
  "installer_longitude" DOUBLE PRECISION NOT NULL,
  "distance_meters" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "installer_driving_distances_pkey" PRIMARY KEY ("installer_id", "customer_address_hash")
);

DO $$ BEGIN
  ALTER TABLE "installer_driving_distances"
    ADD CONSTRAINT "installer_driving_distances_installer_id_fkey"
    FOREIGN KEY ("installer_id") REFERENCES "installers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS "address_geocode_cache"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "installer_driving_distances" ENABLE ROW LEVEL SECURITY;
