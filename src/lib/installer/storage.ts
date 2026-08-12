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

export async function uploadCompletionPhoto(
  orderId: string,
  file: { arrayBuffer(): Promise<ArrayBuffer>; type: string },
): Promise<string> {
  await ensureBucket();
  const supabase = getServiceClient();
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `orders/${orderId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(`PHOTO_UPLOAD_FAILED: ${error.message}`);
  return path;
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
