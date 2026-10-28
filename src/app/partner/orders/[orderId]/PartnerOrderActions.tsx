"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { compressImage } from "@/lib/installer/image";
import {
  PARTNER_SELECTABLE_STATUSES,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUSES,
} from "@/lib/installation/partner/routing";
import {
  addPartnerNoteAction,
  getPartnerUploadTargetsAction,
  setPartnerClaimAmountAction,
  submitPartnerCompletionAction,
  updatePartnerStatusAction,
} from "../actions";

const PHOTO_MAX = 10;

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  ORDER_NOT_FOUND: "주문을 찾을 수 없습니다.",
  ORDER_NOT_WORKABLE: "이미 완료 등록되었거나 진행할 수 없는 건입니다.",
  PARTNER_STATUS_INVALID: "선택할 수 없는 상태입니다.",
  REASON_REQUIRED: "설치 불가 사유를 적어 주세요.",
  NOTE_REQUIRED: "메모 내용을 입력해 주세요.",
  NOTE_TOO_LONG: "메모가 너무 깁니다. (2000자 이하)",
  CLAIM_AMOUNT_INVALID: "청구 금액을 숫자로 입력해 주세요. (1,000만 원 이하)",
  CLAIM_CHANGE_REASON_REQUIRED: "금액을 바꾸는 사유를 적어 주세요.",
  CLAIM_AMOUNT_REQUIRED: "설치 완료 전에 청구 금액을 먼저 입력해 주세요.",
  PHOTO_COUNT_INVALID: `사진은 ${PHOTO_MAX}장까지 올릴 수 있습니다.`,
  PHOTO_UPLOAD_INCOMPLETE: "사진 업로드가 끝나지 않았습니다. 다시 시도해 주세요.",
  UPLOAD_TARGET_FAILED: "사진 업로드 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

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

export default function PartnerOrderActions({
  orderId,
  partnerStatus,
  claimAmount,
}: {
  orderId: string;
  partnerStatus: string | null;
  claimAmount: number | null;
}) {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState(claimAmount != null ? String(claimAmount) : "");
  const [amountReason, setAmountReason] = useState("");
  const [status, setStatus] = useState(partnerStatus ?? PARTNER_STATUSES.RECEIVED);
  const [statusBody, setStatusBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [completionBody, setCompletionBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState<"amount" | "status" | "note" | "completion" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function run(kind: "amount" | "status" | "note" | "completion", operation: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await operation();
      if (!result.ok) {
        setMessage({ tone: "error", text: ERROR_MESSAGES[result.error ?? ""] ?? "처리에 실패했습니다." });
        return false;
      }
      setMessage({ tone: "ok", text: okText });
      router.refresh();
      return true;
    } catch (error) {
      console.error(error);
      setMessage({ tone: "error", text: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleAmount() {
    const digits = amountInput.replace(/[^\d]/g, "");
    if (!digits) {
      setMessage({ tone: "error", text: ERROR_MESSAGES.CLAIM_AMOUNT_INVALID });
      return;
    }
    const ok = await run(
      "amount",
      () => setPartnerClaimAmountAction({ orderId, amount: Number(digits), reason: amountReason }),
      "청구 금액을 저장했습니다.",
    );
    if (ok) setAmountReason("");
  }

  async function handleStatus() {
    const ok = await run(
      "status",
      () => updatePartnerStatusAction({ orderId, status, body: statusBody }),
      "진행 상태를 저장했습니다.",
    );
    if (ok) setStatusBody("");
  }

  async function handleNote() {
    const ok = await run("note", () => addPartnerNoteAction({ orderId, body: noteBody }), "메모를 남겼습니다.");
    if (ok) setNoteBody("");
  }

  async function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (incoming.length === 0) return;
    const compressed = await Promise.all(incoming.map(compressImage));
    setPhotos((current) => [...current, ...compressed].slice(0, PHOTO_MAX));
  }

  async function handleCompletion() {
    if (claimAmount == null) {
      setMessage({ tone: "error", text: ERROR_MESSAGES.CLAIM_AMOUNT_REQUIRED });
      return;
    }
    if (!window.confirm("설치 완료로 등록할까요? 등록하면 본사 검수가 끝날 때까지 수정할 수 없습니다.")) return;

    const ok = await run(
      "completion",
      async () => {
        // 진행 내용과 사진은 선택이다. 사진이 있을 때만 업로드한다.
        let photoPaths: string[] = [];
        if (photos.length > 0) {
          const targets = await getPartnerUploadTargetsAction(orderId, photos.length);
          if (!targets.ok) return targets;

          const supabase = getSupabaseBrowser();
          for (let index = 0; index < photos.length; index += 1) {
            const target = targets.targets[index];
            const upload = await supabase.storage
              .from(targets.bucket)
              .uploadToSignedUrl(target.path, target.token, photos[index]);
            if (upload.error) return { ok: false, error: "PHOTO_UPLOAD_INCOMPLETE" };
          }
          photoPaths = targets.targets.map((target) => target.path);
        }

        return submitPartnerCompletionAction({ orderId, body: completionBody, photoPaths });
      },
      "설치 완료를 등록했습니다. 본사 검수 후 완료 처리됩니다.",
    );
    if (ok) {
      setPhotos([]);
      setCompletionBody("");
    }
  }

  return (
    <div className="grid gap-4">
      {message ? (
        <div
          className={[
            "rounded-md px-3 py-2 text-sm",
            message.tone === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800",
          ].join(" ")}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold">청구 금액</h2>
        <p className="mb-3 mt-1 text-xs text-zinc-500">
          본사에 청구할 시공비입니다. 설치 완료 등록 전까지 수정할 수 있고, 바꿀 때마다 기록이 남습니다.
        </p>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder="예) 150000"
            className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm"
          />
          <span className="text-sm text-zinc-600">원</span>
        </div>
        {claimAmount != null ? (
          <textarea
            value={amountReason}
            onChange={(event) => setAmountReason(event.target.value)}
            rows={2}
            placeholder="금액을 바꾸는 사유 (수정 시 필수)"
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        ) : null}
        <button
          type="button"
          onClick={handleAmount}
          disabled={busy !== null}
          className="mt-2 h-10 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "amount" ? "저장 중…" : claimAmount != null ? "금액 수정" : "금액 저장"}
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-base font-bold">진행 상태</h2>
        <div className="flex flex-wrap gap-2">
          {PARTNER_SELECTABLE_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-semibold",
                status === value
                  ? value === PARTNER_STATUSES.UNABLE
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-300 bg-white text-zinc-700",
              ].join(" ")}
            >
              {PARTNER_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <textarea
          value={statusBody}
          onChange={(event) => setStatusBody(event.target.value)}
          rows={2}
          placeholder={
            status === PARTNER_STATUSES.UNABLE
              ? "설치 불가 사유 (필수)"
              : "담당 기사, 방문 일정 등 (선택)"
          }
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleStatus}
          disabled={busy !== null}
          className="mt-2 h-10 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "status" ? "저장 중…" : "상태 저장"}
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold">설치 완료 등록</h2>
        <p className="mb-3 mt-1 text-xs text-zinc-500">진행 내용과 사진은 선택입니다. 등록하면 본사가 확인한 뒤 완료 처리됩니다.</p>
        <label className="flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-zinc-500">
          사진 추가 ({photos.length}/{PHOTO_MAX})
          <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
        </label>
        {photos.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-xs text-zinc-600">
            {photos.map((photo, index) => (
              <li key={`${photo.name}-${index}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  className="shrink-0 font-semibold text-rose-600"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          value={completionBody}
          onChange={(event) => setCompletionBody(event.target.value)}
          rows={3}
          placeholder="진행 내용 (선택) — 작업 내용, 특이사항 등"
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleCompletion}
          disabled={busy !== null}
          className="mt-2 h-10 w-full rounded-md bg-emerald-700 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "completion" ? "등록 중…" : "설치 완료 등록"}
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-base font-bold">메모</h2>
        <textarea
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          rows={3}
          placeholder="본사와 공유할 내용을 적어 주세요."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleNote}
          disabled={busy !== null}
          className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 disabled:opacity-50"
        >
          {busy === "note" ? "등록 중…" : "메모 남기기"}
        </button>
      </section>
    </div>
  );
}
