import { createClient } from "@supabase/supabase-js";
import {
  getCompletionUploadTargetsAction,
  submitCompletionAction,
} from "@/app/installer/orders/[orderId]/complete/actions";

// Client-side offline queue for completion submissions. If the installer
// submits with no/poor network (e.g. in a basement), the compressed photos +
// form are stored in IndexedDB and auto-flushed when connectivity returns.
// Note: this does NOT make the app openable with zero signal from a cold start
// (the page itself is loaded from the remote URL) — it covers the common
// "form already loaded, lost signal, submit later" case.

export type QueuedCompletionInput = {
  orderId: string;
  capability: string;
  wallpadLinked: boolean;
  wallpadAmount: number | null;
  longDistanceAmount: number | null;
  installEndAt: string;
  photos: Blob[];
};

type StoredCompletion = QueuedCompletionInput & { id: number; queuedAt: string };

const DB_NAME = "installer-app";
const STORE = "completion-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueCompletion(entry: QueuedCompletionInput): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...entry, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function countQueuedCompletions(): Promise<number> {
  const db = await openDb();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}

async function listQueued(): Promise<StoredCompletion[]> {
  const db = await openDb();
  const rows = await new Promise<StoredCompletion[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredCompletion[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}

async function deleteQueued(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

let supabaseBrowser: ReturnType<typeof createClient> | null = null;
function getSupabaseBrowser() {
  if (!supabaseBrowser) {
    supabaseBrowser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    );
  }
  return supabaseBrowser;
}

// The online path: direct-to-Storage upload + submit. Thrown errors (network)
// are treated as retriable; returned {ok:false} (validation) are not.
export async function uploadAndSubmitCompletion(
  entry: QueuedCompletionInput,
): Promise<{ ok: true } | { ok: false; retriable: boolean; error: string }> {
  try {
    const targetsRes = await getCompletionUploadTargetsAction(entry.orderId, entry.photos.length);
    if (!targetsRes.ok) {
      // A transient auth blip must not discard the queued completion.
      return { ok: false, retriable: targetsRes.error === "UNAUTHORIZED", error: targetsRes.error };
    }

    const supabase = getSupabaseBrowser();
    const paths: string[] = [];
    for (let i = 0; i < entry.photos.length; i++) {
      const target = targetsRes.targets[i];
      const up = await supabase.storage
        .from(targetsRes.bucket)
        .uploadToSignedUrl(target.path, target.token, entry.photos[i]);
      if (up.error) throw up.error;
      paths.push(target.path);
    }

    const res = await submitCompletionAction({
      orderId: entry.orderId,
      capability: entry.capability,
      wallpadLinked: entry.wallpadLinked,
      wallpadAmount: entry.wallpadAmount,
      longDistanceAmount: entry.longDistanceAmount,
      installEndAt: entry.installEndAt,
      photoPaths: paths,
    });
    if (!res.ok) return { ok: false, retriable: res.error === "UNAUTHORIZED", error: res.error };
    return { ok: true };
  } catch {
    // network / upload failure — keep it queued for retry
    return { ok: false, retriable: true, error: "NETWORK" };
  }
}

export async function flushCompletionQueue(): Promise<{ flushed: number; remaining: number }> {
  const entries = await listQueued();
  let flushed = 0;
  for (const entry of entries) {
    const res = await uploadAndSubmitCompletion(entry);
    if (res.ok) {
      await deleteQueued(entry.id);
      flushed += 1;
    } else if (!res.retriable) {
      // Order state moved on (already submitted/cancelled) — drop the stale item.
      await deleteQueued(entry.id);
    }
    // retriable → leave in queue for the next attempt
  }
  const remaining = await countQueuedCompletions();
  return { flushed, remaining };
}
