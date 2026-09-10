"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  discardQueuedCompletion,
  flushCompletionQueue,
  listQueuedCompletions,
  retryQueuedCompletion,
  type QueueItemView,
} from "@/lib/installer/completionQueue";

// 오프라인으로 저장된 완료 등록을 보여주고, 연결이 돌아오면 자동으로 보낸다.
// 자동 재시도를 포기한 건(FAILED)은 숨기지 않고 사유와 함께 드러낸다. 예전에는
// 이런 건을 조용히 지워서, 기사는 제출했다고 믿고 본사에는 아무것도 없었다.

const ERROR_LABEL: Record<string, string> = {
  NETWORK: "전송 실패 (통신 상태를 확인해 주세요)",
  PHOTO_TOO_LARGE: "사진 용량이 너무 큽니다 · 사진을 다시 찍어 올려 주세요",
  PHOTO_TYPE_REJECTED: "지원하지 않는 사진 형식입니다 · 사진을 다시 찍어 올려 주세요",
  UPLOAD_REJECTED: "사진을 업로드하지 못했습니다",
  UPLOAD_TEMPORARILY_REJECTED: "일시적으로 업로드가 거부됐습니다",
  STORAGE_UNAVAILABLE: "저장소 오류 · 잠시 후 다시 시도해 주세요",
  PHOTO_MISSING: "업로드된 사진을 찾을 수 없습니다 · 다시 촬영해 주세요",
  ORDER_NOT_SUBMITTABLE: "이미 처리되었거나 취소된 주문입니다",
  PHOTO_COUNT_INVALID: "사진 장수가 올바르지 않습니다",
  INVALID_PHOTO_PATHS: "사진 정보가 올바르지 않습니다",
  INSTALL_END_REQUIRED: "설치 종료 시각이 없습니다",
  NOT_YOUR_ORDER: "담당이 아닌 주문입니다",
  UPLOAD_TARGET_FAILED: "사진 업로드를 준비하지 못했습니다",
  SUBMIT_FAILED: "제출에 실패했습니다",
};

export default function CompletionQueueBanner() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [flushing, setFlushing] = useState(false);

  // 다시 시도·삭제 후 아래 effect 를 다시 돌리기 위한 방아쇠.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // 큐를 읽어 화면에 반영하고, 보낼 게 있으면 보낸다.
    // 언마운트 뒤 setState 하지 않도록 await 마다 cancelled 를 확인한다.
    async function sync() {
      try {
        const current = await listQueuedCompletions();
        if (cancelled) return;
        setItems(current);

        const hasPending = current.some((item) => item.state === "PENDING");
        if (!hasPending || !navigator.onLine) return;

        setFlushing(true);
        await flushCompletionQueue();
        const after = await listQueuedCompletions();
        if (cancelled) return;
        setItems(after);
      } catch {
        // 큐를 못 읽거나 못 보내도 홈 화면을 막지는 않는다. 다음 기회에 다시 시도한다.
      } finally {
        if (!cancelled) setFlushing(false);
      }
    }

    void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [tick]);

  if (items.length === 0) return null;

  const pending = items.filter((item) => item.state === "PENDING");
  const failed = items.filter((item) => item.state === "FAILED");

  async function onRetry(id: number) {
    await retryQueuedCompletion(id);
    setTick((t) => t + 1); // 대기 상태로 돌려놨으니 다시 전송을 시도한다
  }

  async function onDiscard(id: number) {
    if (!window.confirm("이 완료 등록을 삭제할까요? 첨부한 사진도 함께 사라집니다.")) return;
    await discardQueuedCompletion(id);
    setTick((t) => t + 1);
  }

  return (
    <div style={wrap}>
      {pending.length > 0 ? (
        <div style={pendingBanner}>
          ⏳ 오프라인 저장 {pending.length}건 · 연결되면 자동 전송
          {flushing ? " (전송 중…)" : ""}
        </div>
      ) : null}

      {failed.map((item) => (
        <div key={item.id} style={failedBanner}>
          <div style={{ fontWeight: 800 }}>⚠ 전송하지 못한 완료 등록이 있습니다</div>
          <div style={{ marginTop: 4, fontWeight: 500 }}>
            {ERROR_LABEL[item.lastError ?? ""] ?? `전송 실패 (${item.lastError ?? "원인 미상"})`}
            {item.attempts > 0 ? ` · ${item.attempts}회 시도` : ""}
          </div>
          <div style={btnRow}>
            <button type="button" style={retryBtn} onClick={() => onRetry(item.id)}>
              다시 시도
            </button>
            <button type="button" style={discardBtn} onClick={() => onDiscard(item.id)}>
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const wrap: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 };

const pendingBanner: CSSProperties = {
  background: "#fef9c3",
  color: "#854d0e",
  border: "1px solid #fde047",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
};

const failedBanner: CSSProperties = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fca5a5",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
};

const btnRow: CSSProperties = { display: "flex", gap: 8, marginTop: 10 };

const baseBtn: CSSProperties = {
  flex: 1,
  minHeight: 38,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const retryBtn: CSSProperties = {
  ...baseBtn,
  border: "1px solid #991b1b",
  background: "#991b1b",
  color: "#fff",
};

const discardBtn: CSSProperties = {
  ...baseBtn,
  border: "1px solid #fca5a5",
  background: "#fff",
  color: "#991b1b",
};
