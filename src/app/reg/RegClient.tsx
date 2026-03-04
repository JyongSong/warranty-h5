"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import QrScanModal from "./QrScanModal";
import OcrScanModalK100 from "./OcrScanModalK100";

function normalizePhone(input: string) {
  return input.replace(/[^\d]/g, "");
}

type Model = "L100" | "K100" | "U100";

export default function RegClient({ initialSn = "" }: { initialSn?: string }) {
  const router = useRouter();

  const [model, setModel] = useState<Model>("L100");
  const [scanOpen, setScanOpen] = useState(false);

  const [sn, setSn] = useState(initialSn);
  const [installDate, setInstallDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [userPhone, setUserPhone] = useState("");
  const [installerPhone, setInstallerPhone] = useState("");
  const [consent, setConsent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      sn.trim().length >= 6 &&
      installDate.length === 10 &&
      normalizePhone(userPhone).length >= 9 &&
      normalizePhone(installerPhone).length >= 9 &&
      consent &&
      !loading
    );
  }, [sn, installDate, userPhone, installerPhone, consent, loading]);

  async function onSubmit() {
    setError(null);
    setLoading(true);

    try {
      const payload = {
        sn: sn.trim(),
        installDate,
        userPhone: normalizePhone(userPhone),
        installerPhone: normalizePhone(installerPhone),
        consentPrivacy: consent,
      };

      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setError(data?.error ?? "제출에 실패했습니다.");
        return;
      }

      sessionStorage.setItem("lastRegistrationId", data?.id ?? "");
      sessionStorage.setItem("lastConfirmLink", data?.confirmLink ?? "");

      router.push("/success");
    } catch (e: any) {
      setError(e?.message ?? "제출에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        설치정보 등록
      </h1>

      <div style={{ display: "grid", gap: 10 }}>
        {/* 1) 모델 선택 */}
        <label style={{ display: "grid", gap: 6 }}>
          <span>제품 모델</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            style={{ height: 40, padding: "0 12px" }}
          >
            <option value="L100">L100 도어락</option>
            <option value="K100">K100 도어락</option>
            <option value="U100">U100 도어락</option>
          </select>
        </label>

        {/* 2) SN 입력 + 스캔 버튼 */}
        <label style={{ display: "grid", gap: 6 }}>
          <span>제품 S/N</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              placeholder={model === "K100" ? "예: AKSXXXXXXX" : "예: A1B2C3D4..."}
              style={{ height: 40, padding: "0 12px", flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              style={{
                height: 40,
                padding: "0 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {model === "K100" ? "📷 OCR" : "📷 QR"}
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            {model === "K100"
              ? "K100은 SN이 문자로만 제공되어 사진 인식(OCR)을 사용합니다. (AKS로 시작하는 10자리)"
              : "L100/U100은 QR 스캔을 권장합니다."}
          </div>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>설치일</span>
          <input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
            style={{ height: 40, padding: "0 12px" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>고객 전화번호</span>
          <input
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="숫자만 입력"
            style={{ height: 40, padding: "0 12px" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>기사 전화번호</span>
          <input
            value={installerPhone}
            onChange={(e) => setInstallerPhone(e.target.value)}
            placeholder="숫자만 입력"
            style={{ height: 40, padding: "0 12px" }}
          />
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>개인정보 수집 및 이용에 동의합니다.</span>
        </label>

        {error ? (
          <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>
        ) : null}

        <button
          disabled={!canSubmit}
          onClick={onSubmit}
          style={{
            height: 44,
            fontWeight: 700,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "제출 중..." : "제출"}
        </button>
      </div>

      {/* 3) Modal 분기 */}
      {scanOpen && model !== "K100" && (
        <QrScanModal
          title={`${model} QR 스캔`}
          onClose={() => setScanOpen(false)}
          onResult={(value) => {
            setSn(value);
            setScanOpen(false);
          }}
        />
      )}

      {scanOpen && model === "K100" && (
        <OcrScanModalK100
          onClose={() => setScanOpen(false)}
          onResult={(snValue) => {
            setSn(snValue);
            setScanOpen(false);
          }}
        />
      )}
    </div>
  );
}