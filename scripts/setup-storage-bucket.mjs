/**
 * 완료 사진 버킷을 만들거나, 이미 있으면 설정이 기대와 맞는지 점검한다.
 *
 * 런타임 코드(src/lib/installer/storage.ts)는 더 이상 버킷을 만들지 않는다.
 * 요청 처리 중에 버킷을 만들면 실패해도 조용히 넘어가고, 손으로 만든 버킷에는
 * 용량·형식 제한이 없는데 코드만 있는 것처럼 보이는 문제가 있었다.
 *
 *   node scripts/setup-storage-bucket.mjs           # 점검만
 *   node scripts/setup-storage-bucket.mjs --create  # 없으면 만든다
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "installation-photos";
const EXPECTED = {
  public: false,
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY(또는 SERVICE_ROLE_KEY)가 필요하다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const shouldCreate = process.argv.includes("--create");

const { data: bucket, error } = await supabase.storage.getBucket(BUCKET);

if (error && !shouldCreate) {
  console.error(`버킷 '${BUCKET}' 을 읽지 못했다: ${error.message}`);
  console.error("없어서 만들어야 한다면 --create 를 붙여 다시 실행할 것.");
  process.exit(1);
}

if (!bucket) {
  console.log(`버킷 '${BUCKET}' 이 없다. 만드는 중…`);
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: EXPECTED.public,
    fileSizeLimit: EXPECTED.fileSizeLimit,
    allowedMimeTypes: EXPECTED.allowedMimeTypes,
  });
  if (createError) {
    console.error(`생성 실패: ${createError.message}`);
    process.exit(1);
  }
  console.log("생성 완료.");
  process.exit(0);
}

console.log(`버킷 '${BUCKET}' 확인:`);
const problems = [];

if (bucket.public !== EXPECTED.public) {
  problems.push(`public=${bucket.public} (기대: ${EXPECTED.public}) — 완료 사진은 비공개여야 한다`);
}
if (bucket.file_size_limit !== EXPECTED.fileSizeLimit) {
  problems.push(`file_size_limit=${bucket.file_size_limit} (기대: ${EXPECTED.fileSizeLimit})`);
}

const mimes = bucket.allowed_mime_types ?? [];
const missingMimes = EXPECTED.allowedMimeTypes.filter((m) => !mimes.includes(m));
if (mimes.length === 0) {
  problems.push("allowed_mime_types 가 비어 있다 — 어떤 형식이든 올라간다");
} else if (missingMimes.length > 0) {
  problems.push(`allowed_mime_types 에 없음: ${missingMimes.join(", ")}`);
}

if (problems.length === 0) {
  console.log("  설정이 기대값과 일치한다.");
  process.exit(0);
}

console.log("  아래 항목이 기대와 다르다. Supabase 대시보드에서 조정할 것:");
for (const problem of problems) console.log(`   - ${problem}`);
process.exit(1);
