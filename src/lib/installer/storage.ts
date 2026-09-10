import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Private Supabase Storage bucket for installation completion photos. All
// access is mediated server-side with the service role; HQ views via
// short-lived signed URLs (PRD M7 — no public/guessable URLs).

const BUCKET = "installation-photos";

// 본사 검수자가 상세 페이지를 열어 두고 한참 읽다가 사진을 클릭하는 일이 흔하다.
// 10분이면 그사이 링크가 죽어 "사진이 안 열린다" 가 된다.
export const SIGNED_URL_TTL_SECONDS = 60 * 30;

/** 버킷이 이 설정대로 만들어져 있어야 한다. 다르면 경고만 하고 막지는 않는다. */
export const EXPECTED_BUCKET_CONFIG = {
  public: false,
  fileSizeLimitBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
} as const;

let cached: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

let bucketVerified = false;

/**
 * 버킷이 준비돼 있는지 확인한다. 없으면 만들지 않고 실패시킨다.
 *
 * 예전에는 여기서 버킷을 즉석에서 만들었는데 문제가 둘이었다. createBucket 의
 * 오류를 버리고 무조건 "확인됨" 으로 표시해서, 실패해도 그 인스턴스가 사는 동안
 * 계속 실패한 채로 갔다. 그리고 용량·형식 제한이 "이 코드가 만든 버킷" 에만
 * 붙으므로, 손으로 만든 버킷에서는 제한이 없는데 코드만 있는 것처럼 보였다.
 *
 * 이제는 확인만 한다. 버킷 생성은 scripts/setup-storage-bucket.mjs 의 몫이다.
 * 설정이 기대와 다르면 경고만 남기고 통과시킨다 — 업로드를 막을 일은 아니고,
 * 운영이 알아야 할 정보다.
 */
async function assertBucketReady() {
  if (bucketVerified) return;

  const supabase = getServiceClient();
  const { data, error } = await supabase.storage.getBucket(BUCKET);

  // 실패했을 때 bucketVerified 를 세우지 않는 게 핵심이다. 일시적인 오류라면
  // 다음 요청에서 다시 확인해 스스로 회복한다.
  if (error || !data) {
    throw new Error(
      `STORAGE_BUCKET_UNAVAILABLE: '${BUCKET}' — ${error?.message ?? "not found"}. ` +
        `버킷이 없으면 scripts/setup-storage-bucket.mjs 로 먼저 만들 것.`,
    );
  }

  if (data.public) {
    console.error(`[storage] 버킷 '${BUCKET}' 이 public 이다. 완료 사진은 비공개여야 한다.`);
  }
  if (data.file_size_limit !== EXPECTED_BUCKET_CONFIG.fileSizeLimitBytes) {
    console.error(
      `[storage] 버킷 '${BUCKET}' 용량 제한이 ${data.file_size_limit} — 기대값 ${EXPECTED_BUCKET_CONFIG.fileSizeLimitBytes}`,
    );
  }
  if (!data.allowed_mime_types?.length) {
    console.error(`[storage] 버킷 '${BUCKET}' 에 MIME 화이트리스트가 없다.`);
  }

  bucketVerified = true;
}

export const COMPLETION_PHOTO_BUCKET = BUCKET;

// Create one signed upload target per photo so the client uploads DIRECTLY to
// Supabase Storage (bypassing the Vercel Server-Action body limit). Paths are
// scoped to the order; the submit action re-checks the prefix.
async function createUploadTargets(
  prefix: string,
  count: number,
): Promise<Array<{ path: string; token: string }>> {
  await assertBucketReady();
  const supabase = getServiceClient();
  const targets: Array<{ path: string; token: string }> = [];
  for (let i = 0; i < count; i++) {
    const path = `${prefix}${crypto.randomUUID()}.jpg`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(`SIGN_UPLOAD_FAILED: ${error?.message ?? "unknown"}`);
    }
    targets.push({ path: data.path, token: data.token });
  }
  return targets;
}

export function createCompletionUploadTargets(orderId: string, count: number) {
  return createUploadTargets(`orders/${orderId}/`, count);
}

export function createAsCompletionUploadTargets(asOrderId: string, count: number) {
  return createUploadTargets(`as/${asOrderId}/`, count);
}

/**
 * 제출된 경로가 실제로 Storage 에 올라와 있는지 확인한다.
 *
 * 제출 액션은 경로 문자열의 접두사만 검사한다. 그래서 업로드가 부분적으로
 * 실패했는데 제출은 통과하는 상태가 만들어질 수 있고, 그러면 본사에는
 * "완료됐는데 사진이 안 열리는" 주문이 남는다. 여기서 실물을 확인해 막는다.
 *
 * 확실히 없는 것(404)만 걸러낸다. info 호출이 그 밖의 이유로 실패하면 통과시킨다 —
 * 이건 신뢰성을 높이려는 검사지, 저장소가 잠깐 흔들릴 때 기사의 제출을 막으라고
 * 넣은 게 아니다. 크기가 0인 파일도 실패로 본다(업로드가 끊긴 흔적이다).
 *
 * @returns 확인에 실패한 경로들. 비어 있으면 모두 정상.
 */
export async function findMissingPhotos(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];

  const supabase = getServiceClient();
  const checks = await Promise.all(
    paths.map(async (path) => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).info(path);
        if (error) {
          const status = (error as { status?: number }).status;
          // 404 만 "없다" 로 단정한다. 나머지는 판단하지 않고 통과시킨다.
          if (status === 404) return path;
          console.error("[storage/info]", path, error);
          return null;
        }
        if (!data || (typeof data.size === "number" && data.size === 0)) return path;
        return null;
      } catch (error) {
        console.error("[storage/info]", path, error);
        return null;
      }
    }),
  );

  return checks.filter((path): path is string => path !== null);
}

/** 저장된 경로 하나와, 그 경로로 만든 열람용 URL. 서명에 실패하면 url 이 null 이다. */
export type CompletionPhoto = { path: string; url: string | null };

/**
 * 완료 등록 사진의 열람용 서명 URL.
 *
 * 반환 배열의 길이는 항상 paths 와 같다. 예전에는 서명에 실패한 항목을 걸러내
 * 짧은 배열을 돌려줬는데, 그러면 4장 올린 건이 본사 화면에 3장으로 보이고
 * 검수자는 한 장이 빠졌다는 사실조차 알 수 없었다. 실패는 감추지 않고
 * url: null 로 드러내서, 화면이 "못 불러온 사진이 있다" 를 표시할 수 있게 한다.
 *
 * 전체 호출이 실패해도 던지지 않는다. 사진을 못 읽는 것 때문에 주문 상세 페이지
 * 전체가 500 이 되면 검수 자체를 못 하기 때문이다.
 */
export async function getCompletionPhotoSignedUrls(paths: string[]): Promise<CompletionPhoto[]> {
  if (paths.length === 0) return [];

  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[storage/sign-urls]", error);
    return paths.map((path) => ({ path, url: null }));
  }

  const urlByPath = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urlByPath.set(item.path, item.signedUrl);
  }

  return paths.map((path) => ({ path, url: urlByPath.get(path) ?? null }));
}
