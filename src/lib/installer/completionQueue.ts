import { createClient } from "@supabase/supabase-js";
import {
  classifyUploadError,
  isAutoFlushable,
  nextStatus,
  readStatus,
  resetForRetry,
  type QueueEntryStatus,
} from "./completionQueueState";
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

type StoredCompletion = QueuedCompletionInput &
  Partial<QueueEntryStatus> & { id: number; queuedAt: string };

/** 화면에 뿌릴 큐 항목 요약. 사진 Blob 은 뺀다. */
export type QueueItemView = QueueEntryStatus & {
  id: number;
  orderId: string;
  queuedAt: string;
};

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
    tx.objectStore(STORE).add({
      ...entry,
      queuedAt: new Date().toISOString(),
      ...resetForRetry(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 큐에 쌓인 항목을 화면용으로. 사진 Blob 은 제외한다. */
export async function listQueuedCompletions(): Promise<QueueItemView[]> {
  const rows = await listQueued();
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    queuedAt: row.queuedAt,
    ...readStatus(row),
  }));
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

async function patchQueued(id: number, status: QueueEntryStatus): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as StoredCompletion | undefined;
      // 그사이 다른 탭이 지웠을 수 있다. 없으면 되살리지 않고 넘어간다.
      if (row) store.put({ ...row, ...status });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function retryQueuedCompletion(id: number): Promise<void> {
  await patchQueued(id, resetForRetry());
}

export async function discardQueuedCompletion(id: number): Promise<void> {
  await deleteQueued(id);
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

// 온라인 경로: Storage 직접 업로드 후 제출. 던져진 예외는 classifyUploadError 로
// 재시도 여부를 가리고, 서버가 돌려준 {ok:false}(검증 실패)는 UNAUTHORIZED 만
// 재시도한다 — 세션이 잠깐 끊긴 것 때문에 사진까지 버릴 수는 없기 때문이다.
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
  } catch (error) {
    // 업로드 중 터진 예외. 다시 시도해서 달라질 실패인지 아닌지를 가려낸다
    // (용량 초과 같은 건 몇 번을 보내도 같으므로 바로 멈춘다).
    return { ok: false, ...classifyUploadError(error) };
  }
}

/**
 * 대기 중인 항목을 순서대로 전송한다.
 *
 * 성공한 항목만 지운다. 실패는 지우지 않고 상태와 사유를 기록해 두었다가
 * 화면에 드러낸다 (nextStatus 참고). 재시도 상한을 넘기거나 애초에 재시도가
 * 무의미한 실패는 FAILED 로 두고 자동 전송에서 제외한다 — 기사가 '다시 시도'
 * 를 누르기 전까지는 건드리지 않는다.
 */
export async function flushCompletionQueue(): Promise<{
  flushed: number;
  pending: number;
  failed: number;
}> {
  const entries = await listQueued();
  let flushed = 0;

  for (const entry of entries) {
    const status = readStatus(entry);
    if (!isAutoFlushable(status)) continue;

    const outcome = await uploadAndSubmitCompletion(entry);
    const decision = nextStatus(status, outcome);

    if (decision.action === "DELETE") {
      await deleteQueued(entry.id);
      flushed += 1;
    } else {
      await patchQueued(entry.id, decision.status);
    }
  }

  const remaining = await listQueuedCompletions();
  return {
    flushed,
    pending: remaining.filter((r) => r.state === "PENDING").length,
    failed: remaining.filter((r) => r.state === "FAILED").length,
  };
}
