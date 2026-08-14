import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Private Supabase Storage bucket for installation completion photos. All
// access is mediated server-side with the service role; HQ views via
// short-lived signed URLs (PRD M7 — no public/guessable URLs).

const BUCKET = "installation-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

let cached: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = getServiceClient();
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    });
  }
  bucketEnsured = true;
}

export const COMPLETION_PHOTO_BUCKET = BUCKET;

// Create one signed upload target per photo so the client uploads DIRECTLY to
// Supabase Storage (bypassing the Vercel Server-Action body limit). Paths are
// scoped to the order; the submit action re-checks the prefix.
async function createUploadTargets(
  prefix: string,
  count: number,
): Promise<Array<{ path: string; token: string }>> {
  await ensureBucket();
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

export async function getCompletionPhotoSignedUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`SIGN_URL_FAILED: ${error.message}`);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}
