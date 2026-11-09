"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import {
  enqueueCompletion,
  uploadAndSubmitCompletion,
  type QueuedCompletionInput,
} from "@/lib/installer/completionQueue";
import { compressImage } from "@/lib/installer/image";
import ConfirmAmountDialog, { type AmountLine } from "../../../ConfirmAmountDialog";
import { previewInstallSettlementAction, type SettlementPreview } from "./actions";
import PhotoPicker from "../../../PhotoPicker";
import LinkageGuideDialog, { type LinkageCapability } from "./LinkageGuideDialog";
import {
  WALLPAD_BRANDS,
  WALLPAD_FAIL_REASONS,
  WALLPAD_FAIL_REASON_LABEL,
  WALLPAD_MODEL_MAX_LENGTH,
  WALLPAD_NOTE_MAX_LENGTH,
  type WallpadResult,
} from "@/lib/installation/wallpad/constants";
import * as ui from "../../../ui";

const CAPABILITIES = [
  { value: "NONE", label: "없음 (연동 안 함)" },
  { value: "DOORLOCK_AND_APP", label: "APP 연동" },
  { value: "DOORLOCK_AND_APP_AND_HUB", label: "허브 연동 (APP 포함)" },
] as const;

const WALLPAD_OPTIONS: Array<{ value: WallpadResult; label: string }> = [
  { value: "NOT_ATTEMPTED", label: "연동 안 함" },
  { value: "SUCCESS", label: "연동 성공" },
  { value: "FAIL", label: "시도했지만 실패" },
];

type WallpadBilling = "HQ" | "ONSITE";

// 장거리 구간. 기사 등록 주소와 고객 설치 주소 사이의 거리로 고른다.
const LONG_DISTANCE_OPTIONS = [
  { amount: 0, label: "해당 없음 (20km 이하)" },
  { amount: 20000, label: "20km 초과 ~ 40km 이하" },
  { amount: 40000, label: "40km 초과" },
] as const;

const ERR: Record<string, string> = {
  ORDER_NOT_SUBMITTABLE: "완료 등록할 수 없는 상태입니다.",
  PHOTO_COUNT_INVALID: "사진을 1~4장 첨부해 주세요.",
  PHOTO_MISSING: "사진 업로드가 완료되지 않았습니다. 사진을 다시 첨부해 주세요.",
  INVALID_CAPABILITY: "앱/허브 연동 항목을 확인해 주세요.",
  EXTRA_CLAIM_REASON_REQUIRED: "기타 청구 금액의 사유를 입력해 주세요.",
  EXTRA_CLAIM_REASON_TOO_LONG: "기타 청구 사유는 500자 이내로 입력해 주세요.",
  EXTRA_CLAIM_AMOUNT_INVALID: "기타 청구 금액을 확인해 주세요.",
  EXTRA_CLAIM_PHOTO_COUNT_INVALID: "증빙 사진은 최대 4장까지 첨부할 수 있습니다.",
  LINKAGE_PHOTO_REQUIRED: "앱/허브 연동 화면 사진을 1장 이상 첨부해 주세요.",
  LINKAGE_PHOTO_COUNT_INVALID: "연동 화면 사진은 최대 4장까지 첨부할 수 있습니다.",
  WALLPAD_PHOTO_COUNT_INVALID: "월패드 사진은 최대 4장까지 첨부할 수 있습니다.",
  WALLPAD_RESULT_INVALID: "월패드 연동 항목을 확인해 주세요.",
  WALLPAD_BRAND_INVALID: "월패드 제조사를 다시 골라 주세요.",
  WALLPAD_FAIL_REASON_INVALID: "월패드 연동 실패 사유를 다시 골라 주세요.",
  WALLPAD_MODEL_TOO_LONG: "월패드 모델명이 너무 깁니다.",
  WALLPAD_NOTE_TOO_LONG: "월패드 메모는 500자 이내로 입력해 주세요.",
  WALLPAD_BILLING_INVALID: "월패드 결제 방식(본사 청구/현장 결제)을 다시 골라 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  DEFAULT: "제출에 실패했습니다. 다시 시도해 주세요.",
};

export default function CompleteClient({
  orderId,
  erpOrderNo,
  address,
  linkageAppFee,
  linkageHubFee,
  wallpadModels,
  orderWallpadBilling,
  wallpadHqFee,
}: {
  orderId: string;
  erpOrderNo: string;
  address: string;
  /** 이 기사에게 적용되는 연동비. 선택지 옆에 그대로 보여 준다. */
  linkageAppFee: number;
  linkageHubFee: number;
  /** 월패드 모델명 자동완성 목록(호환 DB). 비어 있어도 직접 입력할 수 있다. */
  wallpadModels: Array<{ brand: string; model: string }>;
  /** 주문 품목 기준 월패드 결제 방식. hq: 온라인 결제(본사 청구) 품목, onsite: 현장결제 품목이 있다. */
  orderWallpadBilling: { hq: boolean; onsite: boolean };
  /** 본사 청구 월패드 고정 금액 */
  wallpadHqFee: number;
}) {
  const router = useRouter();
  const [capability, setCapability] = useState<string>("NONE");
  const [wallpadResult, setWallpadResult] = useState<WallpadResult>("NOT_ATTEMPTED");
  const [wallpadBrand, setWallpadBrand] = useState("");
  const [wallpadModel, setWallpadModel] = useState("");
  const [wallpadFailReason, setWallpadFailReason] = useState("");
  const [wallpadNote, setWallpadNote] = useState("");
  const [wallpadAmount, setWallpadAmount] = useState("");
  // 주문 품목대로 미리 골라 둔다. 기사가 바꿀 수 있고, 주문과 다르면 제출 때 한 번 더 묻는다.
  const [wallpadBilling, setWallpadBilling] = useState<WallpadBilling>(
    orderWallpadBilling.hq ? "HQ" : "ONSITE",
  );
  const [billingMismatchOpen, setBillingMismatchOpen] = useState(false);
  const [longDistanceAmount, setLongDistanceAmount] = useState(0);
  const [extraClaimAmount, setExtraClaimAmount] = useState("");
  const [extraClaimReason, setExtraClaimReason] = useState("");
  const [extraClaimPhotos, setExtraClaimPhotos] = useState<File[]>([]);
  const [linkagePhotos, setLinkagePhotos] = useState<File[]>([]);
  const [wallpadPhotos, setWallpadPhotos] = useState<File[]>([]);
  const [guideFor, setGuideFor] = useState<LinkageCapability | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  // 입력 → 설치 사진, 두 화면으로 나눈다. 입력한 값과 고른 사진이 화면을 오가도
  // 남아 있어야 해서 경로를 나누지 않고 한 컴포넌트 안에서 바꾼다.
  const [step, setStep] = useState<"form" | "photos">("form");
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);

  const linkageFees: Record<string, number> = {
    NONE: 0,
    DOORLOCK_AND_APP: linkageAppFee,
    DOORLOCK_AND_APP_AND_HUB: linkageHubFee,
  };
  // 0 은 청구가 없는 것으로 본다(서버도 같은 기준).
  const hasExtraClaim = (toNumberOrNull(extraClaimAmount) ?? 0) > 0;
  const extraClaimReasonMissing = hasExtraClaim && !extraClaimReason.trim();
  // 연동을 골랐으면 연동 화면 사진이 있어야 넘어간다. 연동비 승인의 근거다.
  const linked = capability !== "NONE";
  const linkagePhotoMissing = linked && linkagePhotos.length === 0;
  // 월패드는 실패도 남긴다. 제조사·모델·사유는 모를 수 있어 모두 선택이다.
  const wallpadLinked = wallpadResult === "SUCCESS";
  const wallpadAttempted = wallpadResult !== "NOT_ATTEMPTED";
  const wallpadHq = wallpadLinked && wallpadBilling === "HQ";
  const billingMismatch = wallpadLinked ? describeBillingMismatch(wallpadBilling, orderWallpadBilling) : null;
  const wallpadModelOptions = wallpadModels.filter(
    (m) => !wallpadBrand || !WALLPAD_BRANDS.includes(m.brand as never) || m.brand === wallpadBrand,
  );
  const canGoToPhotos = !extraClaimReasonMissing && !linkagePhotoMissing && !busy && !compressing;
  const canSubmit = photos.length >= 1 && photos.length <= 4 && canGoToPhotos;

  // 사진 화면은 히스토리에 한 칸을 쌓아 둔다. 기기의 뒤로 가기가 주문 화면으로
  // 빠져나가 입력한 내용을 날리지 않고 입력 화면으로 돌아오게 하려는 것이다.
  useEffect(() => {
    const onPopState = () => {
      setConfirming(false);
      setStep("form");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  function goToPhotos() {
    setError(null);
    window.history.pushState({ completeStep: "photos" }, "");
    setStep("photos");
  }

  // 압축해서 담는다. 어느 첨부든 4장까지.
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

  function chooseCapability(value: string) {
    setCapability(value);
    // 연동을 고르면 어떤 화면을 올려야 하는지 바로 띄운다.
    if (value !== "NONE") setGuideFor(value as LinkageCapability);
  }

  // 제출 버튼은 곧바로 보내지 않고 금액을 먼저 계산해 보여준다.
  // 월패드 결제 방식이 주문과 다르면 그 전에 한 번 확인받는다.
  async function askConfirm(skipBillingCheck = false) {
    setError(null);
    if (billingMismatch && !skipBillingCheck) {
      setBillingMismatchOpen(true);
      return;
    }
    setBillingMismatchOpen(false);
    setBusy(true);

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const result: SettlementPreview = offline
      ? { ok: false }
      : await previewInstallSettlementAction({
          orderId,
          capability,
          longDistanceAmount: longDistanceAmount > 0 ? longDistanceAmount : null,
          extraClaimAmount: hasExtraClaim ? toNumberOrNull(extraClaimAmount) : null,
          wallpadAmount: wallpadLinked && !wallpadHq ? toNumberOrNull(wallpadAmount) : null,
          wallpadBilling: wallpadLinked ? wallpadBilling : null,
        });

    setPreview(result);
    setBusy(false);
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const amount = wallpadAmount.replace(/[^\d]/g, "");
    const entry: QueuedCompletionInput = {
      orderId,
      capability,
      wallpadLinked,
      // 현장 금액은 연동에 성공한 현장 결제 건만 보낸다. 본사 청구는 금액이 고정이다.
      wallpadAmount: wallpadLinked && !wallpadHq && amount ? Number(amount) : null,
      wallpadBilling: wallpadLinked ? wallpadBilling : null,
      wallpadResult,
      wallpadBrand: wallpadAttempted ? wallpadBrand || null : null,
      wallpadModel: wallpadAttempted ? wallpadModel.trim() || null : null,
      wallpadFailReason: wallpadResult === "FAIL" ? wallpadFailReason || null : null,
      wallpadNote: wallpadAttempted ? wallpadNote.trim() || null : null,
      longDistanceAmount: longDistanceAmount > 0 ? longDistanceAmount : null,
      // 금액이 없으면 사유·증빙도 보내지 않는다. 적다 만 내용이 딸려 가지 않게.
      extraClaimAmount: hasExtraClaim ? toNumberOrNull(extraClaimAmount) : null,
      extraClaimReason: hasExtraClaim ? extraClaimReason.trim() : null,
      extraClaimPhotos: hasExtraClaim ? extraClaimPhotos : [],
      // 고르지 않은 항목의 사진은 보내지 않는다(서버도 버린다).
      linkagePhotos: linked ? linkagePhotos : [],
      wallpadPhotos: wallpadAttempted ? wallpadPhotos : [],
      // 설치 종료 시각 = 지금 제출을 누른 시각. 오프라인 대기열에 들어가도
      // 나중에 전송된 시각이 아니라 이 시각이 남는다.
      installEndAt: new Date().toISOString(),
      photos,
    };

    // Offline → save locally and auto-send when connectivity returns.
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
    if (res.ok) {
      setBusy(false);
      router.push("/installer");
      return;
    }
    if (res.retriable) {
      // network dropped mid-submit → queue for auto-retry
      try {
        await enqueueCompletion(entry);
      } catch {
        // ignore
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
        {step === "form" ? (
          <>
            <button style={backLink} onClick={() => router.push(`/installer/orders/${orderId}`)}>
              ← 취소
            </button>
            <h1 style={ui.h1}>완료 등록</h1>
            <p style={ui.sub}>
              {erpOrderNo}
              {address ? ` · ${address}` : ""}
            </p>

            <div style={ui.card}>
              <div style={ui.label}>앱/허브 연동</div>
              {CAPABILITIES.map((c) => (
                <label key={c.value} style={radioRow}>
                  <input
                    type="radio"
                    name="capability"
                    checked={capability === c.value}
                    onChange={() => chooseCapability(c.value)}
                  />
                  <span style={optionLabel}>{c.label}</span>
                  <OptionAmount amount={linkageFees[c.value]} />
                </label>
              ))}
              {linked ? (
                <>
                  <PhotoPicker
                    embedded
                    label="연동 화면 사진 (필수, 최대 4장)"
                    photos={linkagePhotos}
                    busy={compressing}
                    onAdd={(files) => void addTo(files, linkagePhotos, setLinkagePhotos)}
                    onRemove={(index) => setLinkagePhotos(linkagePhotos.filter((_, i) => i !== index))}
                  />
                  <button style={guideLink} onClick={() => setGuideFor(capability as LinkageCapability)}>
                    어떤 화면을 올려야 하나요?
                  </button>
                  {linkagePhotoMissing ? (
                    <div style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>
                      연동 화면 사진을 올려야 다음으로 넘어갈 수 있습니다.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div style={ui.card}>
              <div style={ui.label}>월패드 연동</div>
              {WALLPAD_OPTIONS.map((o) => (
                <label key={o.value} style={radioRow}>
                  <input
                    type="radio"
                    name="wallpadResult"
                    checked={wallpadResult === o.value}
                    onChange={() => setWallpadResult(o.value)}
                  />
                  <span style={optionLabel}>{o.label}</span>
                </label>
              ))}
              {wallpadAttempted ? (
                <>
                  <div style={{ ...helpText, margin: "6px 0 10px" }}>
                    {wallpadResult === "FAIL"
                      ? "안 되는 단지·모델을 모으는 자료입니다. 실패해도 꼭 남겨 주세요. 정산에는 영향이 없습니다."
                      : "어느 단지·모델에서 되는지 모으는 자료입니다."}
                  </div>
                  <select
                    style={ui.input}
                    value={wallpadBrand}
                    onChange={(e) => setWallpadBrand(e.target.value)}
                  >
                    <option value="">월패드 제조사 (선택)</option>
                    {WALLPAD_BRANDS.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...ui.input, marginTop: 10 }}
                    value={wallpadModel}
                    onChange={(e) => setWallpadModel(e.target.value)}
                    maxLength={WALLPAD_MODEL_MAX_LENGTH}
                    list="wallpad-model-options"
                    autoCapitalize="characters"
                    placeholder="모델명 (선택, 예: KHN-Q100LT)"
                  />
                  <datalist id="wallpad-model-options">
                    {wallpadModelOptions.map((m) => (
                      <option key={`${m.brand}-${m.model}`} value={m.model}>
                        {m.brand}
                      </option>
                    ))}
                  </datalist>
                  {wallpadResult === "FAIL" ? (
                    <>
                      <select
                        style={{ ...ui.input, marginTop: 10 }}
                        value={wallpadFailReason}
                        onChange={(e) => setWallpadFailReason(e.target.value)}
                      >
                        <option value="">실패 사유 (선택)</option>
                        {WALLPAD_FAIL_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {WALLPAD_FAIL_REASON_LABEL[reason]}
                          </option>
                        ))}
                      </select>
                      <textarea
                        style={{ ...ui.input, marginTop: 10, minHeight: 72, resize: "vertical" }}
                        value={wallpadNote}
                        onChange={(e) => setWallpadNote(e.target.value)}
                        maxLength={WALLPAD_NOTE_MAX_LENGTH}
                        placeholder="메모 (선택) — 현장에서 확인한 내용"
                      />
                    </>
                  ) : (
                    <div style={billingBox}>
                      <div style={{ ...ui.label, marginBottom: 2 }}>결제 방식</div>
                      <label style={radioRow}>
                        <input
                          type="radio"
                          name="wallpadBilling"
                          checked={wallpadBilling === "HQ"}
                          onChange={() => setWallpadBilling("HQ")}
                        />
                        <span style={optionLabel}>
                          본사 청구
                          {orderWallpadBilling.hq ? <span style={orderTag}>주문 품목</span> : null}
                        </span>
                        <OptionAmount amount={wallpadHqFee} />
                      </label>
                      <label style={radioRow}>
                        <input
                          type="radio"
                          name="wallpadBilling"
                          checked={wallpadBilling === "ONSITE"}
                          onChange={() => setWallpadBilling("ONSITE")}
                        />
                        <span style={optionLabel}>
                          현장 결제
                          {orderWallpadBilling.onsite ? <span style={orderTag}>주문 품목</span> : null}
                        </span>
                      </label>
                      {wallpadHq ? (
                        <div style={{ ...helpText, margin: "4px 0 0" }}>
                          고객이 온라인으로 이미 결제한 건입니다. 금액 입력 없이{" "}
                          {wallpadHqFee.toLocaleString()}원이 정산에 포함됩니다.
                        </div>
                      ) : (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ ...helpText, margin: "0 0 8px" }}>
                            고객에게 현장에서 직접 받은 금액입니다. 정산에는 포함되지 않습니다.
                          </div>
                          <MoneyInput
                            value={wallpadAmount}
                            onChange={setWallpadAmount}
                            placeholder="현장 금액 (선택)"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <PhotoPicker
                    embedded
                    label="월패드 사진 (선택, 최대 4장 · 모델명 라벨이 보이게)"
                    photos={wallpadPhotos}
                    busy={compressing}
                    onAdd={(files) => void addTo(files, wallpadPhotos, setWallpadPhotos)}
                    onRemove={(index) => setWallpadPhotos(wallpadPhotos.filter((_, i) => i !== index))}
                  />
                </>
              ) : null}
            </div>

            <div style={ui.card}>
              <div style={ui.label}>장거리 비용</div>
              {LONG_DISTANCE_OPTIONS.map((o) => (
                <label key={o.amount} style={radioRow}>
                  <input
                    type="radio"
                    name="longDistance"
                    checked={longDistanceAmount === o.amount}
                    onChange={() => setLongDistanceAmount(o.amount)}
                  />
                  <span style={optionLabel}>{o.label}</span>
                  <OptionAmount amount={o.amount} />
                </label>
              ))}
              <div style={{ ...helpText, margin: "6px 0 0" }}>
                장거리 기준은 기사님 등록 주소와 고객 설치 주소 사이의 네이버 지도 최단 거리입니다. 본사에서
                거리를 확인한 뒤 승인된 건에 한해 지급됩니다.
              </div>
            </div>

            <div style={ui.card}>
              <label style={ui.label}>기타 청구 금액 (선택)</label>
              <div style={helpText}>
                이 주문과 관련해 본사에 청구할 다른 금액이 있으면 입력해 주세요. 본사 확인 후 승인되면 정산
                금액에 포함되어 지급됩니다.
              </div>
              <MoneyInput value={extraClaimAmount} onChange={setExtraClaimAmount} placeholder="청구 금액" />
              {hasExtraClaim ? (
                <>
                  <textarea
                    style={{
                      ...ui.input,
                      marginTop: 10,
                      minHeight: 84,
                      resize: "vertical",
                    }}
                    value={extraClaimReason}
                    onChange={(e) => setExtraClaimReason(e.target.value)}
                    maxLength={500}
                    placeholder="청구 사유 (필수) — 무엇에 든 비용인지 적어 주세요"
                  />
                  {extraClaimReasonMissing ? (
                    <div style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>
                      청구 사유를 입력해야 제출할 수 있습니다.
                    </div>
                  ) : null}
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

            <div style={{ marginTop: 8 }}>
              <button style={ui.primaryButton(!canGoToPhotos)} disabled={!canGoToPhotos} onClick={goToPhotos}>
                설치 사진 업로드
              </button>
            </div>
          </>
        ) : (
          <>
            <button style={backLink} onClick={() => window.history.back()}>
              ← 이전
            </button>
            <h1 style={ui.h1}>설치 사진 업로드</h1>
            <p style={ui.sub}>
              {erpOrderNo}
              {address ? ` · ${address}` : ""}
            </p>

            <PhotoPicker
              label="설치 사진 (필수, 1~4장)"
              photos={photos}
              busy={compressing}
              onAdd={(files) => void addTo(files, photos, setPhotos)}
              onRemove={(index) => setPhotos(photos.filter((_, i) => i !== index))}
            />

            {error ? <div style={ui.errorText}>{error}</div> : null}

            <div style={{ marginTop: 8 }}>
              <button style={ui.primaryButton(!canSubmit)} disabled={!canSubmit} onClick={() => void askConfirm()}>
                {busy ? "제출 중…" : "완료 제출"}
              </button>
            </div>
          </>
        )}
      </div>

      <LinkageGuideDialog
        selected={guideFor}
        fees={{ DOORLOCK_AND_APP: linkageAppFee, DOORLOCK_AND_APP_AND_HUB: linkageHubFee }}
        onClose={() => setGuideFor(null)}
      />

      {billingMismatchOpen && billingMismatch ? (
        <div style={backdrop} role="dialog" aria-modal="true" aria-label="월패드 결제 방식 확인">
          <div style={sheet}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>월패드 결제 방식이 주문과 다릅니다</div>
            <div style={{ fontSize: 14, color: "#3f3f46", lineHeight: 1.6, marginTop: 10 }}>{billingMismatch}</div>
            <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6, marginTop: 8 }}>
              선택: <b>{wallpadBilling === "HQ" ? "본사 청구" : "현장 결제"}</b>. 맞으면 그대로 제출하고, 아니면 다시
              선택해 주세요.
            </div>
            <div style={{ marginTop: 18 }}>
              <button
                style={ui.primaryButton(false)}
                onClick={() => {
                  setBillingMismatchOpen(false);
                  window.history.back();
                }}
              >
                다시 선택
              </button>
              <div style={{ height: 8 }} />
              <button style={ui.secondaryButton} onClick={() => void askConfirm(true)}>
                이대로 제출
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmAmountDialog
        open={confirming}
        title="이 금액으로 완료 등록합니다"
        amount={preview?.ok ? preview.totalAmount : null}
        lines={previewLines(preview)}
        note={previewNote(preview)}
        busy={busy}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}

// 선택지 오른쪽에 붙는 "+20,000원". 0원이면 아무것도 보여 주지 않는다.
function OptionAmount({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <span style={optionAmount}>+{amount.toLocaleString()}원</span>;
}

// 금액 입력란. 숫자만 받아 천 단위로 끊어 보여 주고 "원" 은 오른쪽에 붙박아 둔다.
// value 는 숫자만 담은 문자열이다.
export function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder: string;
}) {
  const digits = value.replace(/[^\d]/g, "");
  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...ui.input, paddingRight: 40 }}
        value={digits ? Number(digits).toLocaleString() : ""}
        onChange={(e) =>
          onChange(
            e.target.value
              .replace(/[^\d]/g, "")
              .replace(/^0+(?=\d)/, "")
              .slice(0, 9),
          )
        }
        inputMode="numeric"
        placeholder={placeholder}
      />
      <span style={{ ...moneySuffix, color: digits ? "#18181b" : "#a1a1aa" }}>원</span>
    </div>
  );
}

export function toNumberOrNull(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** 고른 결제 방식이 주문 품목과 다르면 기사에게 보여 줄 문장. 같으면 null. */
function describeBillingMismatch(
  chosen: WallpadBilling,
  order: { hq: boolean; onsite: boolean },
): string | null {
  if (chosen === "HQ" && !order.hq) {
    return order.onsite
      ? "이 주문의 월패드 연동은 현장 결제 건입니다. 고객에게 현장에서 받아야 합니다."
      : "이 주문에는 본사 청구 월패드 연동 품목이 없습니다.";
  }
  if (chosen === "ONSITE" && order.hq && !order.onsite) {
    return "이 주문은 고객이 월패드 연동비를 온라인으로 이미 결제한 건입니다. 본사 청구로 등록해야 합니다.";
  }
  return null;
}

function previewLines(preview: SettlementPreview | null): AmountLine[] {
  if (!preview?.ok) return [];
  return [
    { label: "연동비", value: preview.linkageFee },
    { label: "출장비", value: preview.travelFee },
    { label: "장거리", value: preview.longDistanceFee },
    { label: "기타 청구", value: preview.extraClaimFee },
    { label: "월패드 (본사 청구)", value: preview.wallpadFee },
    // 할증 폐지 전에 처음 제출했던 건을 다시 올릴 때만 남아 있는 항목.
    ...(preview.nightWeekendFee > 0 ? [{ label: "야간/휴일", value: preview.nightWeekendFee }] : []),
  ];
}

function previewNote(preview: SettlementPreview | null) {
  if (!preview?.ok) return null;
  const tags = [preview.night ? "야간" : null, preview.weekend ? "휴일" : null].filter(Boolean);
  return (
    <>
      {tags.length > 0 ? <div>{tags.join(" · ")} 할증이 적용됐습니다.</div> : null}
      {preview.wallpadAmount > 0 ? (
        <div>
          월패드 현장 수금 {preview.wallpadAmount.toLocaleString()}원은 정산 금액에 포함되지 않습니다.
        </div>
      ) : null}
      {preview.extraClaimFee > 0 ? <div>기타 청구 금액은 본사 확인 후 승인된 금액만 지급됩니다.</div> : null}
      <div>본사 승인 후 확정됩니다.</div>
    </>
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

const guideLink: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#2563eb",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 0 0",
  textDecoration: "underline",
  cursor: "pointer",
};

const helpText: CSSProperties = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
  margin: "0 0 10px",
};

const billingBox: CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  border: `1px solid ${ui.BORDER}`,
  borderRadius: 10,
};
const orderTag: CSSProperties = {
  marginLeft: 6,
  fontSize: 11,
  fontWeight: 700,
  color: "#2563eb",
  background: "#eff6ff",
  borderRadius: 6,
  padding: "2px 6px",
  verticalAlign: "middle",
};
const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 100,
};
const sheet: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  borderRadius: "16px 16px 0 0",
  padding: "22px 18px calc(22px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const radioRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  fontSize: 15,
};
const optionLabel: CSSProperties = { flex: 1, minWidth: 0 };
const optionAmount: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#52525b",
  whiteSpace: "nowrap",
};
const moneySuffix: CSSProperties = {
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 16,
  pointerEvents: "none",
};
