/**
 * Supabase Storage 의 완료 사진 버킷을 로컬 디렉터리로 미러링한다. 읽기 전용이다.
 *
 *   node scripts/backup-storage.mjs <대상 디렉터리> [이전 백업의 storage 디렉터리]
 *
 * 두 번째 인수를 주면, 이전 백업에 이미 같은 크기로 들어 있는 사진은 다시 받지 않고
 * hard link 로 연결한다. 그래서 백업마다 디렉터리는 완전한 스냅샷으로 보이지만
 * 디스크에는 사진 한 장이 한 번만 저장된다. 오래된 백업을 지워도 남은 스냅샷이
 * 링크를 붙들고 있으므로 사진은 사라지지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "installation-photos";
const dest = process.argv[2];
const linkFrom = process.argv[3] ?? null;
if (!dest) {
  console.error("사용법: node scripts/backup-storage.mjs <대상 디렉터리> [이전 storage 디렉터리]");
  process.exit(1);
}

const envFile = process.env.ENV_FILE ?? ".env.local";
const env = fs.readFileSync(envFile, "utf8");
const read = (key) => (env.match(new RegExp(`^${key}="?([^"\n]*)"?$`, "m")) ?? [])[1];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? read("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? read("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error(`${envFile} 에서 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 못 찾았다`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

/** 버킷을 재귀적으로 훑어 파일 목록을 만든다. */
async function listAll(prefix = "") {
  const files = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list('${prefix}') 실패: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // id 가 없는 항목은 실제 객체가 아니라 폴더다.
      if (entry.id === null) files.push(...(await listAll(full)));
      else files.push({ key: full, size: entry.metadata?.size ?? null });
    }
    if (data.length < pageSize) break;
  }
  return files;
}

const files = await listAll();
console.log(`  버킷 '${BUCKET}': 객체 ${files.length} 개`);

let downloaded = 0;
let linked = 0;
let downloadedBytes = 0;
const failures = [];

for (const file of files) {
  const target = path.join(dest, file.key);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  // 1. 이전 백업에 같은 크기로 있으면 hard link 로 끝낸다. 네트워크를 타지 않는다.
  if (linkFrom && file.size !== null) {
    const previous = path.join(linkFrom, file.key);
    try {
      if (fs.statSync(previous).size === file.size) {
        fs.linkSync(previous, target);
        linked += 1;
        continue;
      }
    } catch {
      // 이전 백업에 없다 — 아래에서 내려받는다.
    }
  }

  // 2. 같은 디렉터리에 이미 받아 둔 게 있으면(재실행) 건너뛴다.
  if (file.size !== null) {
    try {
      if (fs.statSync(target).size === file.size) {
        linked += 1;
        continue;
      }
    } catch {
      // 없다 — 내려받는다.
    }
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(file.key);
  if (error || !data) {
    failures.push(`${file.key}: ${error?.message ?? "빈 응답"}`);
    continue;
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(target, buffer);
  downloaded += 1;
  downloadedBytes += buffer.byteLength;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
console.log(`  새로 내려받음 ${downloaded} 개 (${mb(downloadedBytes)}), 기존 링크 ${linked} 개`);
if (failures.length) {
  console.error(`  실패 ${failures.length} 개:`);
  for (const f of failures) console.error(`    ${f}`);
  process.exit(1);
}
