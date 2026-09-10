/**
 * 완료 사진 버킷에서 아무도 참조하지 않는 객체를 세어 본다. 읽기 전용이다 —
 * 아무것도 지우지 않는다.
 *
 *   node scripts/audit-orphan-photos.mjs                 # 요약만
 *   node scripts/audit-orphan-photos.mjs --days 14       # 유예 기간 조정(기본 7일)
 *   node scripts/audit-orphan-photos.mjs --csv out.csv   # 고아 목록을 CSV 로
 *
 * 왜 유예 기간을 두나: 방금 올라왔지만 아직 제출되지 않은 사진, 오프라인 큐에서
 * 전송을 기다리는 사진이 있다. 이들은 참조가 없는 게 정상이므로 고아로 세면 안 된다.
 *
 * 판정 규칙은 src/lib/installer/orphanPhotos.ts 에 있고 단위 테스트가 붙어 있다.
 * 이 스크립트는 데이터를 모아 그 함수에 넣고 결과를 출력할 뿐이다.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { findOrphans, groupByPrefix } from "../src/lib/installer/orphanPhotos.ts";

const BUCKET = "installation-photos";
const PAGE_SIZE = 1000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const graceDays = Number(arg("--days", "7"));
const csvPath = arg("--csv", null);

if (!Number.isFinite(graceDays) || graceDays < 0) {
  console.error("--days 는 0 이상의 숫자여야 한다.");
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

/** 버킷 전체를 커서로 훑는다. listV2 는 기본이 평면 목록이라 폴더를 파고들 필요가 없다. */
async function listAllObjects() {
  const objects = [];
  let cursor;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .listV2({ limit: PAGE_SIZE, cursor });

    if (error) throw new Error(`목록 조회 실패: ${error.message}`);

    for (const item of data.objects ?? []) {
      const path = item.key ?? item.name;
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      objects.push({
        path,
        createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
        sizeBytes: item.metadata?.size ?? 0,
      });
    }

    process.stdout.write(`\r  객체 ${objects.length}개 읽음…`);
    if (!data.hasNext || !data.nextCursor) break;
    cursor = data.nextCursor;
  }

  process.stdout.write("\r");
  return objects;
}

/** DB 가 실제로 가리키고 있는 경로 전부. 설치 완료 + A/S 완료 두 곳이다. */
async function listReferencedPaths() {
  const referenced = new Set();

  const completions = await prisma.installationCompletion.findMany({
    select: { photoPaths: true },
  });
  for (const row of completions) for (const path of row.photoPaths) referenced.add(path);

  const asOrders = await prisma.asOrder.findMany({
    select: { completionPhotoPaths: true },
  });
  for (const row of asOrders) for (const path of row.completionPhotoPaths) referenced.add(path);

  return referenced;
}

try {
  console.log(`버킷 '${BUCKET}' 점검 (유예 ${graceDays}일)\n`);

  const [objects, referenced] = await Promise.all([listAllObjects(), listReferencedPaths()]);

  const createdBefore = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
  const result = findOrphans(objects, referenced, { createdBefore });

  const totalBytes = objects.reduce((sum, o) => sum + o.sizeBytes, 0);

  console.log("전체");
  console.log(`  객체            ${result.totalCount}개 · ${formatBytes(totalBytes)}`);
  console.log(`  DB 참조 경로    ${referenced.size}개`);
  console.log(`  그중 실재       ${result.referencedCount}개`);

  // 참조는 있는데 파일이 없는 경우 — 본사 화면에서 "불러오지 못함" 으로 보인다.
  const presentPaths = new Set(objects.map((o) => o.path));
  const danglingRefs = [...referenced].filter((p) => !presentPaths.has(p));
  if (danglingRefs.length > 0) {
    console.log(`\n⚠ DB 는 가리키는데 파일이 없는 경로 ${danglingRefs.length}개`);
    for (const path of danglingRefs.slice(0, 10)) console.log(`    ${path}`);
    if (danglingRefs.length > 10) console.log(`    … 외 ${danglingRefs.length - 10}개`);
  }

  console.log(`\n유예 기간 안이라 제외   ${result.tooRecent.length}개`);
  console.log(`고아                    ${result.orphans.length}개 · ${formatBytes(result.orphanBytes)}`);

  if (result.orphans.length > 0) {
    const oldest = result.orphans.reduce(
      (min, o) => (o.createdAt && (!min || o.createdAt < min) ? o.createdAt : min),
      null,
    );
    if (oldest) console.log(`  가장 오래된 것          ${oldest.toISOString().slice(0, 10)}`);

    const groups = [...groupByPrefix(result.orphans)].sort((a, b) => b[1].length - a[1].length);
    console.log(`  폴더 ${groups.length}곳에 흩어져 있음. 상위:`);
    for (const [prefix, items] of groups.slice(0, 10)) {
      const bytes = items.reduce((sum, o) => sum + o.sizeBytes, 0);
      console.log(`    ${prefix}  ${items.length}개 · ${formatBytes(bytes)}`);
    }

    const share = result.totalCount > 0 ? (result.orphans.length / result.totalCount) * 100 : 0;
    console.log(`\n  → 전체 객체의 ${share.toFixed(1)}% 가 고아다.`);
  }

  if (csvPath && result.orphans.length > 0) {
    const rows = ["path,created_at,size_bytes"];
    for (const o of result.orphans) {
      rows.push(`${o.path},${o.createdAt ? o.createdAt.toISOString() : ""},${o.sizeBytes}`);
    }
    fs.writeFileSync(csvPath, rows.join("\n") + "\n", "utf8");
    console.log(`\n고아 목록 저장: ${csvPath}`);
  }

  console.log("\n아무것도 삭제하지 않았다.");
} catch (error) {
  console.error("\n실패:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
