/**
 * 완료 사진 버킷에서 참조가 끊긴 객체를 지운다.
 *
 * 기본은 실행 계획만 보여주는 dry-run 이다. 실제로 지우려면 --delete 를 붙여야 한다.
 * 저장소 삭제는 되돌릴 수 없으므로, 먼저 scripts/audit-orphan-photos.mjs 로
 * 규모를 확인하고 나서 쓸 것.
 *
 *   node scripts/cleanup-orphan-photos.mjs                    # 계획만 (기본)
 *   node scripts/cleanup-orphan-photos.mjs --days 14          # 유예 기간(기본 7일)
 *   node scripts/cleanup-orphan-photos.mjs --limit 500        # 한 번에 지울 최대 개수
 *   node scripts/cleanup-orphan-photos.mjs --delete           # 실제 삭제
 *
 * 안전 장치가 셋이다.
 *  1. 유예 기간: 방금 올라왔지만 아직 제출되지 않은 사진을 지우지 않는다.
 *  2. 삭제 직전 재확인: 목록을 뜬 뒤 제출이 들어왔을 수 있으므로, 지우기 바로
 *     전에 DB 참조를 다시 읽어 교차 검증한다.
 *  3. --delete 없이는 아무것도 지우지 않는다.
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { findOrphans, groupByPrefix } from "../src/lib/installer/orphanPhotos.ts";

const BUCKET = "installation-photos";
const PAGE_SIZE = 1000;
const DELETE_BATCH = 100;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const graceDays = Number(arg("--days", "7"));
const limit = Number(arg("--limit", "1000"));
const reallyDelete = process.argv.includes("--delete");

if (!Number.isFinite(graceDays) || graceDays < 1) {
  console.error("--days 는 1 이상이어야 한다. 방금 올라온 사진을 지우면 정상 제출이 깨진다.");
  process.exit(1);
}
if (!Number.isFinite(limit) || limit < 1) {
  console.error("--limit 은 1 이상의 숫자여야 한다.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY(또는 SERVICE_ROLE_KEY)가 필요하다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const prisma = new PrismaClient();

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function listAllObjects() {
  const objects = [];
  let cursor;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .listV2({ limit: PAGE_SIZE, cursor });
    if (error) throw new Error(`목록 조회 실패: ${error.message}`);
    for (const item of data.objects ?? []) {
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      objects.push({
        path: item.key ?? item.name,
        createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
        sizeBytes: item.metadata?.size ?? 0,
      });
    }
    if (!data.hasNext || !data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return objects;
}

async function listReferencedPaths() {
  const referenced = new Set();
  const completions = await prisma.installationCompletion.findMany({ select: { photoPaths: true } });
  for (const row of completions) for (const path of row.photoPaths) referenced.add(path);
  const asOrders = await prisma.asOrder.findMany({ select: { completionPhotoPaths: true } });
  for (const row of asOrders) for (const path of row.completionPhotoPaths) referenced.add(path);
  return referenced;
}

try {
  console.log(`버킷 '${BUCKET}' · 유예 ${graceDays}일 · 최대 ${limit}개`);
  console.log(reallyDelete ? "모드: 실제 삭제\n" : "모드: DRY-RUN (아무것도 지우지 않는다)\n");

  const [objects, referenced] = await Promise.all([listAllObjects(), listReferencedPaths()]);
  const createdBefore = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
  const result = findOrphans(objects, referenced, { createdBefore });

  console.log(`전체 ${result.totalCount}개 · 참조됨 ${result.referencedCount}개 · 유예 ${result.tooRecent.length}개`);
  console.log(`고아 ${result.orphans.length}개 · ${formatBytes(result.orphanBytes)}`);

  if (result.orphans.length === 0) {
    console.log("\n지울 것이 없다.");
    process.exit(0);
  }

  const targets = result.orphans.slice(0, limit);
  if (targets.length < result.orphans.length) {
    console.log(`이번 실행 대상은 ${targets.length}개 (--limit). 나머지는 다시 실행하면 된다.`);
  }

  const groups = [...groupByPrefix(targets)].sort((a, b) => b[1].length - a[1].length);
  console.log(`\n폴더 ${groups.length}곳. 상위:`);
  for (const [prefix, items] of groups.slice(0, 10)) {
    console.log(`  ${prefix}  ${items.length}개`);
  }

  if (!reallyDelete) {
    console.log("\n계획만 출력했다. 실제로 지우려면 --delete 를 붙일 것.");
    process.exit(0);
  }

  // 목록을 뜬 시점과 지우는 시점 사이에 제출이 들어왔을 수 있다. 다시 읽어 교차 검증한다.
  console.log("\n삭제 직전 DB 참조를 다시 확인하는 중…");
  const referencedNow = await listReferencedPaths();
  const safe = targets.filter((o) => !referencedNow.has(o.path));
  const rescued = targets.length - safe.length;
  if (rescued > 0) {
    console.log(`  그사이 참조가 생긴 ${rescued}개는 삭제 대상에서 뺀다.`);
  }

  let deleted = 0;
  for (let i = 0; i < safe.length; i += DELETE_BATCH) {
    const batch = safe.slice(i, i + DELETE_BATCH).map((o) => o.path);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`  배치 삭제 실패 (${i}~): ${error.message}`);
      break;
    }
    deleted += batch.length;
    process.stdout.write(`\r  ${deleted}/${safe.length} 삭제…`);
  }
  process.stdout.write("\r");

  console.log(`\n삭제 완료: ${deleted}개`);
  if (deleted < safe.length) {
    console.log(`실패로 남은 것: ${safe.length - deleted}개. 다시 실행하면 이어서 처리한다.`);
  }
} catch (error) {
  console.error("\n실패:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
