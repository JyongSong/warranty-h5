"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import QrScanModal from "./QrScanModal";
import { getErrorMessage } from "@/lib/error";
import { formatKrPhone, normalizePhone } from "@/lib/phone";

type Model = "L100" | "K100" | "U100";
type InstallType = "installer" | "self";
type InstallerCheckStatus = "idle" | "registered" | "external";
type InstallerItem = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  coverage: string | null;
  category: string | null;
};

const EXTERNAL_INSTALLER_NOTICE =
  "본사 공인 설치 기사가 아닙니다. 본사 공인 기사가 시공해야 2년 무상 A/S 혜택을 받으실 수 있습니다.";

export default function RegClient({ initialSn = "" }: { initialSn?: string }) {
  const router = useRouter();

  const [model, setModel] = useState<Model>("L100");
  const [installType, setInstallType] = useState<InstallType>("installer");
  const [scanOpen, setScanOpen] = useState(false);

  const [sn, setSn] = useState(initialSn);
  const [installDate, setInstallDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [userPhone, setUserPhone] = useState("");
  const [installerPhone, setInstallerPhone] = useState("");
  const [selectedInstaller, setSelectedInstaller] = useState<InstallerItem | null>(null);
  const [verifyingInstaller, setVerifyingInstaller] = useState(false);
  const [installerCheckStatus, setInstallerCheckStatus] = useState<InstallerCheckStatus>("idle");
  const [installerVerifyMessage, setInstallerVerifyMessage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
   const canSubmit = useMemo(() => {
    return (
      sn.trim().length >= 6 &&
      installDate.length === 10 &&
      normalizePhone(userPhone).length >= 9 &&
      (installType === "self" ||
        (normalizePhone(installerPhone).length >= 9 && installerCheckStatus !== "idle")) &&
      consent &&
      !loading
    );
  }, [
    sn,
    installDate,
    userPhone,
    installerPhone,
    installerCheckStatus,
    installType,
    consent,
    loading,
  ]);

  async function verifyInstallerPhone() {
    const phone = normalizePhone(installerPhone);
    if (phone.length < 9) {
      setInstallerCheckStatus("idle");
      setInstallerVerifyMessage("기사 전화번호를 먼저 입력해 주세요.");
      return;
    }

    setVerifyingInstaller(true);
    setInstallerVerifyMessage(null);

    try {
      const r = await fetch(`/api/installers/verify?phone=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      const data = await r.json().catch(() => ({}));

      if (r.status === 404 && data?.error === "INSTALLER_NOT_FOUND") {
        setSelectedInstaller(null);
        setInstallerCheckStatus("external");
        setInstallerVerifyMessage(EXTERNAL_INSTALLER_NOTICE);
        return;
      }

      if (!r.ok) {
        throw new Error(data?.error ?? "기사 확인에 실패했습니다.");
      }

      const installer = data?.item as InstallerItem;
      setSelectedInstaller(installer);
      setInstallerPhone(installer.phone);
      setInstallerCheckStatus("registered");
      setInstallerVerifyMessage("기사님 전화가 확인되었습니다.");
    } catch (error: unknown) {
      setSelectedInstaller(null);
      setInstallerCheckStatus("idle");
      setInstallerVerifyMessage(getErrorMessage(error, "기사 확인에 실패했습니다."));
    } finally {
      setVerifyingInstaller(false);
    }
  }

  async function onSubmit() {
    setError(null);
    setLoading(true);

    try {
      const finalInstallType =
        installType === "self"
          ? "self"
          : installerCheckStatus === "external"
            ? "external"
            : "installer";

      const payload = {
        sn: sn.trim(),
        installType: finalInstallType,
        installDate,
        userPhone: normalizePhone(userPhone),
        installerPhone: installType === "self" ? "" : normalizePhone(installerPhone),
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
      sessionStorage.setItem("lastRegistrationStatus", data?.status ?? "");
      sessionStorage.setItem("lastInstallType", data?.installType ?? installType);
      sessionStorage.setItem("lastFreeAsEndDate", data?.freeAsEndDate ?? "");

      router.push("/success");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "제출에 실패했습니다."));
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
          <span>설치 유형</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => setInstallType("installer")}
              style={typeButtonStyle(installType === "installer")}
            >
              기사 설치
            </button>
            <button
              type="button"
              onClick={() => {
                setInstallType("self");
                setInstallerPhone("");
                setSelectedInstaller(null);
                setInstallerCheckStatus("idle");
                setInstallerVerifyMessage(null);
              }}
              style={typeButtonStyle(installType === "self")}
            >
              자가 설치
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            {installType === "self"
              ? "자가 설치는 제출 즉시 확인 완료 처리됩니다."
              : "기사 설치는 기사님 확인 링크 발송 후 최종 완료됩니다."}
          </div>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>제품 모델</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            style={inputStyle}
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
              style={{ ...inputStyle, flex: 1 }}
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
              📷 QR
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            {model === "K100"
              ? "K100도 QR 스캔으로 S/N 입력을 진행합니다."
              : "L100/U100은 QR 스캔을 권장합니다."}
          </div>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>설치일</span>
          <input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>고객 전화번호</span>
          <input
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="숫자만 입력"
            style={inputStyle}
          />
        </label>

        {installType === "installer" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span>기사 전화번호</span>
            <input
              value={installerPhone}
              onChange={(e) => {
                setInstallerPhone(e.target.value);
                setSelectedInstaller(null);
                setInstallerCheckStatus("idle");
                setInstallerVerifyMessage(null);
              }}
              placeholder="기사 전화번호 입력"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={verifyInstallerPhone}
              disabled={verifyingInstaller}
              style={primaryButtonStyle(verifyingInstaller)}
            >
              {verifyingInstaller ? "확인 중..." : "기사님 전화 확인"}
            </button>
            {selectedInstaller && installerCheckStatus === "registered" ? (
              <div
                style={{
                  borderRadius: 12,
                  background: "#eef8ee",
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {selectedInstaller.name} / {formatKrPhone(selectedInstaller.phone)}
                {selectedInstaller.branch ? ` / ${selectedInstaller.branch}` : ""}
                {selectedInstaller.region ? ` / ${selectedInstaller.region}` : ""}
              </div>
            ) : null}
            {installerCheckStatus === "external" ? (
              <div
                style={{
                  borderRadius: 12,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  color: "#9a3412",
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {EXTERNAL_INSTALLER_NOTICE}
                <div style={{ marginTop: 6, fontSize: 12, color: "#7c2d12" }}>
                  계속 진행하시면 외부 기사 시공으로 등록됩니다.
                </div>
              </div>
            ) : null}
            {installerVerifyMessage && installerCheckStatus !== "external" ? (
              <div
                style={{
                  fontSize: 12,
                  color: installerCheckStatus === "registered" ? "#1d5e1d" : "#b42318",
                }}
              >
                {installerVerifyMessage}
              </div>
            ) : null}
            {installerCheckStatus === "idle" && normalizePhone(installerPhone).length >= 9 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                기사님 전화 확인 버튼을 눌러 확인 후 제출해 주세요.
              </div>
            ) : null}
          </label>
        ) : null}

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
      {scanOpen && (
        <QrScanModal
          title={`${model} QR 스캔`}
          onClose={() => setScanOpen(false)}
          onResult={(value) => {
            setSn(value);
            setScanOpen(false);
          }}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 10,
  background: "#fff",
  fontSize: 14,
  color: "#111",
  outline: "none",
};

function typeButtonStyle(active: boolean): React.CSSProperties {
  return {
    height: 44,
    borderRadius: 12,
    border: active ? "1px solid #1d3129" : "1px solid #e4e4e7",
    background: active ? "#1d3129" : "#f4f4f5",
    color: active ? "#fff" : "#71717a",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: active ? "0 6px 16px rgba(29,49,41,0.25)" : "none",
    transform: active ? "translateY(-1px)" : "none",
    transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 44,
    borderRadius: 12,
    border: "1px solid #1d3129",
    background: "#1d3129",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    boxShadow: disabled ? "none" : "0 6px 16px rgba(29,49,41,0.25)",
    transform: disabled ? "none" : "translateY(-1px)",
    transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  };
}
