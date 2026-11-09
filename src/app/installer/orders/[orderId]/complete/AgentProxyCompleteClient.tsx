"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import {
  enqueueCompletion,
  uploadAndSubmitCompletion,
  type QueuedCompletionInput,
} from "@/lib/installer/completionQueue";
import { compressImage } from "@/lib/installer/image";
import ConfirmAmountDialog from "../../../ConfirmAmountDialog";
import PhotoPicker from "../../../PhotoPicker";
import { AgentProxyBadge } from "../../../cards";
import { MoneyInput, toNumberOrNull } from "./CompleteClient";
import * as ui from "../../../ui";

const ERR: Record<string, string> = {
  ORDER_NOT_SUBMITTABLE: "완료 등록할 수 없는 상태입니다.",
  PHOTO_COUNT_INVALID: "사진은 최대 4장까지 첨부할 수 있습니다.",
  PHOTO_MISSING: "사진 업로드가 완료되지 않았습니다. 사진을 다시 첨부해 주세요.",
  AGENT_PROXY_BASE_FEE_INVALID: "기본 출장비를 확인해 주세요.",
  ACTUAL_INSTALLER_TOO_LONG: "실제 시공자는 100자 이내로 입력해 주세요.",
  EXTRA_CLAIM_REASON_REQUIRED: "기타 청구 금액의 사유를 입력해 주세요.",
  EXTRA_CLAIM_REASON_TOO_LONG: "기타 청구 사유는 500자 이내로 입력해 주세요.",
  EXTRA_CLAIM_AMOUNT_INVALID: "기타 청구 금액을 확인해 주세요.",
  EXTRA_CLAIM_PHOTO_COUNT_INVALID: "증빙 사진은 최대 4장까지 첨부할 수 있습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

/**
 * 총판 대행 건 완료 등록.
 *
 * 총판이 현지 기사를 섭외해 처리한 건이라 일반 완료 등록과 다르다:
 * 기본 출장비(기본값을 미리 채움, 수정 가능) + 기타 청구로 정산하고, 설치 사진은 선택이다.
 * 연동·월패드·장거리 항목은 없다(월패드 비용이 있으면 기타 청구에 넣는다).
 * 금액은 본사 검수 때 확정된다.
 */
export default function AgentProxyCompleteClient({
  orderId,
  erpOrderNo,
  address,
  defaultBaseFee,
}: {
  orderId: string;
  erpOrderNo: string;
  address: string;
  /** 본사 설정의 기본 출장비 기본값 */
  defaultBaseFee: number;
}) {
  const router = useRouter();
  const [baseFee, setBaseFee] = useState(String(defaultBaseFee));
  const [extraClaimAmount, setExtraClaimAmount] = useState("");
  const [extraClaimReason, setExtraClaimReason] = useState("");
  const [extraClaimPhotos, setExtraClaimPhotos] = useState<File[]>([]);
  const [actualInstaller, setActualInstaller] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const baseFeeValue = toNumberOrNull(baseFee);
  const baseFeeMissing = baseFeeValue === null;
  const extraClaimValue = toNumberOrNull(extraClaimAmount) ?? 0;
  // 0 은 청구가 없는 것으로 본다(서버도 같은 기준).
  const hasExtraClaim = extraClaimValue > 0;
  const extraClaimReasonMissing = hasExtraClaim && !extraClaimReason.trim();
  const baseFeeChanged = baseFeeValue !== null && baseFeeValue !== defaultBaseFee;
  const canSubmit = !baseFeeMissing && !extraClaimReasonMissing && !busy && !compressing;
  const total = (baseFeeValue ?? 0) + (hasExtraClaim ? extraClaimValue : 0);

  async function addTo(
    list: FileList | null,
    current: File[],
    setter: (update: (prev: File[]) => File[]) => void,
  ) {
    if (!list) return;
    setCompressing(true);
    const incoming = Array.from(list).slice(0, 4 - current.length);
    const compressed = await Promise.all(incoming.map(compressImage));
    setter((prev) => [...prev, ...compressed].slice(0, 4));
    setCompressing(false);
  }

  async function submit() {
    if (baseFeeValue === null) return;
    setBusy(true);
    setError(null);

    const entry: QueuedCompletionInput = {
      orderId,
      // 대행 건은 연동·월패드·장거리를 받지 않는다. 서버도 같은 값으로 덮어쓴다.
      capability: "NONE",
      wallpadLinked: false,
      wallpadAmount: null,
      wallpadResult: "NOT_ATTEMPTED",
      longDistanceAmount: null,
      linkagePhotos: [],
      wallpadPhotos: [],
      extraClaimAmount: hasExtraClaim ? extraClaimValue : null,
      extraClaimReason: hasExtraClaim ? extraClaimReason.trim() : null,
      extraClaimPhotos: hasExtraClaim ? extraClaimPhotos : [],
      agentProxyBaseFee: baseFeeValue,
      actualInstaller: actualInstaller.trim() || null,
      installEndAt: new Date().toISOString(),
      photos,
    };

    // 오프라인이면 기기에 저장해 두고 연결되면 자동으로 보낸다(일반 완료 등록과 같은 대기열).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueCompletion(entry);
      } catch {
        // ignore — nothing more we can do offline
      }
      setBusy(false);
      router.push("/installer");
      return;
    }

    const res = await uploadAndSubmitCompletion(entry);
    if (res.ok || res.retriable) {
      if (!res.ok) {
        try {
          await enqueueCompletion(entry);
        } catch {
          // ignore
        }
      }
      setBusy(false);
      router.push("/installer");
      return;
    }
    setBusy(false);
    setConfirming(false);
    setError(ERR[res.error] ?? ERR.DEFAULT);
  }

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <button style={backLink} onClick={() => router.push(`/installer/orders/${orderId}`)}>
          ← 취소
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ ...ui.h1, margin: 0 }}>완료 등록</h1>
          <AgentProxyBadge />
        </div>
        <p style={ui.sub}>
          {erpOrderNo}
          {address ? ` · ${address}` : ""}
        </p>

        <div style={notice}>총판 대행 건입니다. 사진은 선택이고, 금액은 직접 입력합니다. 본사 확인 후 확정됩니다.</div>

        <div style={ui.card}>
          <label style={ui.label}>기본 출장비 (필수)</label>
          <MoneyInput value={baseFee} onChange={setBaseFee} placeholder="기본 출장비" />
          <div style={{ ...helpText, margin: "6px 0 0" }}>
            기본값 {defaultBaseFee.toLocaleString()}원 · 필요하면 수정하세요.
            {baseFeeChanged ? <span style={{ color: "#b45309", fontWeight: 700 }}> 기본값과 다릅니다.</span> : null}
          </div>
          {baseFeeMissing ? <div style={errorHint}>기본 출장비를 입력해 주세요. 없으면 0 을 입력하세요.</div> : null}
        </div>

        <div style={ui.card}>
          <label style={ui.label}>기타 청구 (선택)</label>
          <div style={helpText}>현지 기사 추가 비용, 장거리 이동, 월패드 등 기본 출장비 외에 청구할 금액입니다.</div>
          <MoneyInput value={extraClaimAmount} onChange={setExtraClaimAmount} placeholder="청구 금액" />
          {hasExtraClaim ? (
            <>
              <textarea
                style={{ ...ui.input, marginTop: 10, minHeight: 84, resize: "vertical" }}
                value={extraClaimReason}
                onChange={(e) => setExtraClaimReason(e.target.value)}
                maxLength={500}
                placeholder="청구 사유 (필수) — 무엇에 든 비용인지 적어 주세요"
              />
              {extraClaimReasonMissing ? <div style={errorHint}>청구 사유를 입력해야 제출할 수 있습니다.</div> : null}
              <PhotoPicker
                embedded
                label="청구 증빙 사진 (선택, 최대 4장)"
                photos={extraClaimPhotos}
                busy={compressing}
                onAdd={(files) => void addTo(files, extraClaimPhotos, setExtraClaimPhotos)}
                onRemove={(index) => setExtraClaimPhotos(extraClaimPhotos.filter((_, i) => i !== index))}
              />
            </>
          ) : null}
        </div>

        <div style={ui.card}>
          <label style={ui.label}>실제 시공자 (선택)</label>
          <div style={helpText}>현장에 간 현지 기사입니다. 나중에 A/S 가 생기면 확인용으로 씁니다.</div>
          <input
            style={ui.input}
            value={actualInstaller}
            onChange={(e) => setActualInstaller(e.target.value)}
            maxLength={100}
            placeholder="이름 / 연락처"
          />
        </div>

        <PhotoPicker
          label="설치 사진 (선택, 최대 4장)"
          photos={photos}
          busy={compressing}
          onAdd={(files) => void addTo(files, photos, setPhotos)}
          onRemove={(index) => setPhotos(photos.filter((_, i) => i !== index))}
        />

        <div style={ui.card}>
          <div style={summaryRow}>
            <span style={{ color: "#71717a" }}>기본 출장비</span>
            <span>{(baseFeeValue ?? 0).toLocaleString()}원</span>
          </div>
          <div style={summaryRow}>
            <span style={{ color: "#71717a" }}>기타 청구</span>
            <span>{(hasExtraClaim ? extraClaimValue : 0).toLocaleString()}원</span>
          </div>
          <div style={{ ...summaryRow, fontWeight: 800, borderTop: `1px solid ${ui.BORDER}`, marginTop: 4, paddingTop: 8 }}>
            <span>청구 합계</span>
            <span>{total.toLocaleString()}원</span>
          </div>
        </div>

        {error ? <div style={ui.errorText}>{error}</div> : null}

        <div style={{ marginTop: 8 }}>
          <button
            style={ui.primaryButton(!canSubmit)}
            disabled={!canSubmit}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            {busy ? "제출 중…" : "완료 등록"}
          </button>
        </div>
      </div>

      <ConfirmAmountDialog
        open={confirming}
        title="이 금액으로 완료 등록합니다"
        amount={total}
        lines={[
          { label: "기본 출장비", value: baseFeeValue ?? 0 },
          { label: "기타 청구", value: hasExtraClaim ? extraClaimValue : 0 },
        ]}
        note={<div>총판 대행 건은 본사 확인 후 승인된 금액으로 확정됩니다.</div>}
        busy={busy}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}

const backLink: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#52525b",
  fontSize: 14,
  fontWeight: 600,
  padding: "4px 0",
  marginBottom: 8,
  cursor: "pointer",
};

const notice: CSSProperties = {
  background: "#f5f3ff",
  color: "#5b21b6",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.5,
  marginBottom: 12,
};

const helpText: CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
  margin: "0 0 10px",
};

const errorHint: CSSProperties = { fontSize: 12, color: "#b42318", marginTop: 6 };

const summaryRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  padding: "3px 0",
};
