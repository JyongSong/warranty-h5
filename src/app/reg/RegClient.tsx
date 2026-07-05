"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import QrScanModal from "./QrScanModal";
import SnLocationModal from "./SnLocationModal";
import { getErrorMessage } from "@/lib/error";
import { formatKrPhone, normalizePhone } from "@/lib/phone";

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

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RegClient({ initialSn = "" }: { initialSn?: string }) {
  const router = useRouter();

  const [installType, setInstallType] = useState<InstallType>("installer");
  // 통합 스캐너: ZXing BrowserMultiFormatReader 로 QR + 1D 바코드 동시 인식.
  const [scanOpen, setScanOpen] = useState(false);
  const [snHelpOpen, setSnHelpOpen] = useState(false);

  const [maxDate, setMaxDate] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setMaxDate(getTodayString());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const [sn, setSn] = useState(initialSn);
  const [installDate, setInstallDate] = useState(() => getTodayString());
  const [userPhone, setUserPhone] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [smsTimer, setSmsTimer] = useState(0);
  const [smsMessage, setSmsMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const [installerPhone, setInstallerPhone] = useState("");
  const [selectedInstaller, setSelectedInstaller] = useState<InstallerItem | null>(null);
  const [verifyingInstaller, setVerifyingInstaller] = useState(false);
  const [installerCheckStatus, setInstallerCheckStatus] = useState<InstallerCheckStatus>("idle");
  const [installerVerifyMessage, setInstallerVerifyMessage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (smsTimer <= 0) return;
    const timer = setInterval(() => {
      setSmsTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setSmsMessage({ text: "인증시간이 초과되었습니다. 다시 시도해 주세요.", isError: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [smsTimer]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePhoneChange = (val: string) => {
    setUserPhone(val);
    setSmsSent(false);
    setVerificationCode("");
    setIsPhoneVerified(false);
    setSmsTimer(0);
    setSmsMessage(null);
  };

  async function sendSmsCode() {
    const phone = normalizePhone(userPhone);
    if (phone.length < 9) {
      setSmsMessage({ text: "올바른 전화번호를 입력해 주세요.", isError: true });
      return;
    }

    setSendingSms(true);
    setSmsMessage(null);

    try {
      const response = await fetch("/api/auth/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "인증번호 발송에 실패했습니다.");
      }

      setSmsSent(true);
      setVerificationCode("");
      setIsPhoneVerified(false);
      setSmsTimer(180); // 3 mins
      setSmsMessage({ text: "인증번호가 발송되었습니다.", isError: false });
    } catch (err: unknown) {
      setSmsMessage({
        text: getErrorMessage(err, "인증번호 발송에 실패했습니다."),
        isError: true,
      });
    } finally {
      setSendingSms(false);
    }
  }

  async function verifySmsCode() {
    const phone = normalizePhone(userPhone);
    if (!verificationCode.trim()) {
      setSmsMessage({ text: "인증번호를 입력해 주세요.", isError: true });
      return;
    }

    setVerifyingCode(true);
    setSmsMessage(null);

    try {
      const response = await fetch("/api/auth/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, code: verificationCode }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "인증번호 확인에 실패했습니다.");
      }

      setIsPhoneVerified(true);
      setSmsTimer(0);
      setSmsMessage({ text: "인증되었습니다.", isError: false });
    } catch (err: unknown) {
      setSmsMessage({
        text: getErrorMessage(err, "인증번호 확인에 실패했습니다."),
        isError: true,
      });
    } finally {
      setVerifyingCode(false);
    }
  }

  const canSubmit = useMemo(() => {
    const todayStr = getTodayString();
    return (
      sn.trim().length >= 6 &&
      installDate.length === 10 &&
      installDate <= todayStr &&
      isPhoneVerified &&
      (installType === "self" ||
        (normalizePhone(installerPhone).length >= 9 && installerCheckStatus !== "idle")) &&
      consent &&
      !loading
    );
  }, [
    sn,
    installDate,
    isPhoneVerified,
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
        consentMarketing,
      };

      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        const errorCode = data?.error;
        const errorMap: Record<string, string> = {
          SN_NOT_FOUND: "입력하신 SN(일련번호)이 올바르지 않습니다. 다시 확인해 주세요.",
          ALREADY_CONFIRMED: "이미 등록 완료된 SN(일련번호)입니다.",
          INVALID_SN: "올바르지 않은 SN(일련번호) 형식입니다.",
          INVALID_INSTALL_DATE: "올바른 설치 완료일을 선택해 주세요.",
          INSTALL_DATE_IN_FUTURE: "설치 완료일은 미래 날짜일 수 없습니다.",
          INVALID_USER_PHONE: "올바른 전화번호를 입력해 주세요.",
          INVALID_INSTALLER_PHONE: "올바른 기사님 전화번호를 입력해 주세요.",
          INSTALLER_NOT_FOUND: "등록되지 않은 기사님 전화번호입니다.",
          CONSENT_REQUIRED: "필수 개인정보 동의가 필요합니다.",
        };

        if (errorCode === "SN_NOT_FOUND") {
          alert("SN (일련번호) 입력 오류\n\n입력하신 SN(일련번호)이 올바르지 않습니다. 기기 본체 또는 박스 라벨의 일련번호를 다시 확인해 주세요.");
          setError("SN (일련번호) 입력 오류: 일련번호를 다시 확인해 주세요.");
        } else {
          setError(errorMap[errorCode] ?? errorCode ?? "제출에 실패했습니다.");
        }
        return;
      }

      sessionStorage.setItem("lastRegistrationId", data?.id ?? "");
      sessionStorage.setItem("lastConfirmLink", data?.confirmLink ?? "");
      sessionStorage.setItem("lastRegistrationStatus", data?.status ?? "");
      sessionStorage.setItem("lastInstallType", data?.installType ?? installType);
      sessionStorage.setItem("lastFreeAsEndDate", data?.freeAsEndDate ?? "");
      sessionStorage.setItem(
        "lastInstallerPhone",
        installType === "self" ? "" : normalizePhone(installerPhone)
      );

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

        {/* 2) 제품 SN 입력 + 스캔 버튼 */}
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            제품 SN (일련번호)
            <button
              type="button"
              onClick={() => setSnHelpOpen(true)}
              style={snHelpLinkStyle}
            >
              SN (일련번호) 위치 확인
            </button>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              placeholder="예: A1B2C3D4... 또는 AKSXXXXXXX"
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
              📷 SN 스캔
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            QR 또는 바코드를 카메라에 비춰 SN을 자동 입력합니다.
          </div>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>설치 완료일</span>
          <input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
            max={maxDate || undefined}
            style={inputStyle}
          />
          {maxDate && installDate > maxDate && (
            <div style={{ color: "crimson", fontSize: 12 }}>
              설치 완료일은 오늘 또는 과거 날짜여야 합니다.
            </div>
          )}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>전화번호</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={userPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="숫자만 입력 (예: 01012345678)"
              disabled={isPhoneVerified}
              style={{ ...inputStyle, flex: 1 }}
            />
            {isPhoneVerified ? (
              <button
                type="button"
                onClick={() => {
                  setIsPhoneVerified(false);
                  setSmsSent(false);
                  setVerificationCode("");
                  setSmsTimer(0);
                  setSmsMessage(null);
                }}
                style={minorButtonStyle(false)}
              >
                번호 변경
              </button>
            ) : (
              <button
                type="button"
                onClick={sendSmsCode}
                disabled={sendingSms || normalizePhone(userPhone).length < 9}
                style={minorButtonStyle(sendingSms || normalizePhone(userPhone).length < 9)}
              >
                {sendingSms ? "전송 중..." : smsSent ? "인증번호 재전송" : "인증번호 전송"}
              </button>
            )}
          </div>
          {isPhoneVerified && (
            <div style={{ fontSize: 13, color: "#1d5e1d", fontWeight: "600", display: "flex", alignItems: "center", gap: 4 }}>
              ✓ 인증이 완료되었습니다.
            </div>
          )}
          {smsMessage && !isPhoneVerified && (
            <div style={{ fontSize: 12, color: smsMessage.isError ? "#b42318" : "#1d5e1d" }}>
              {smsMessage.text}
            </div>
          )}
        </label>

        {smsSent && !isPhoneVerified && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>인증번호 입력</span>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="6자리 인증번호"
                  maxLength={6}
                  style={{ ...inputStyle, width: "100%", paddingRight: 60 }}
                />
                {smsTimer > 0 && (
                  <span style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#e11d48",
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    {formatTimer(smsTimer)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={verifySmsCode}
                disabled={verifyingCode || verificationCode.trim().length !== 6 || smsTimer === 0}
                style={minorButtonStyle(verifyingCode || verificationCode.trim().length !== 6 || smsTimer === 0)}
              >
                {verifyingCode ? "확인 중..." : "인증 확인"}
              </button>
            </div>
          </label>
        )}

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

        {/* 5) 개인정보 수집 및 이용 동의 */}
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              [필수] 개인정보 수집 및 이용 동의
            </span>
            <Link
              href="/privacy"
              target="_blank"
              style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "#71717a",
                textDecoration: "underline",
              }}
            >
              약관 보기
            </Link>
          </label>
          <div style={{
            fontSize: 11,
            color: "#71717a",
            background: "#f4f4f5",
            padding: "8px 12px",
            borderRadius: 8,
            lineHeight: 1.5,
            border: "1px solid #e4e4e7"
          }}>
            • <b>수집/이용 목적:</b> 무상 A/S 서비스 제공 및 설치 등록 확인<br />
            • <b>수집 항목:</b> 휴대폰 번호, 제품 및 설치 정보(제품 일련번호, 설치 완료일, 설치 유형, 기사 전화번호)<br />
            • <b>보유/이용 기간:</b> <b>등록일로부터 무상 A/S 기간 만료 시까지 (공인 기사 설치 시 2년, 자가/외부 기사 설치 시 1년 후 즉시 파기)</b><br />
            • 귀하는 동의를 거부할 권리가 있으나, 거부 시 무상 A/S 혜택 등록 및 서비스 제공이 불가합니다.
          </div>
        </div>

        {/* 6) 마케팅 정보 수신 동의 */}
        <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consentMarketing}
              onChange={(e) => setConsentMarketing(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              [선택] 마케팅 및 광고성 정보 수신 동의 (SMS)
            </span>
          </label>
          <div style={{
            fontSize: 11,
            color: "#71717a",
            background: "#f4f4f5",
            padding: "8px 12px",
            borderRadius: 8,
            lineHeight: 1.5,
            border: "1px solid #e4e4e7"
          }}>
            • <b>수집/이용 목적:</b> 신제품 및 서비스 안내, 이벤트/프로모션 혜택 전송<br />
            • <b>수집 항목:</b> 휴대폰 번호<br />
            • <b>보유/이용 기간:</b> <b>동의 철회 시 또는 서비스 종료 시까지</b><br />
            • 동의하지 않으셔도 무상 A/S 혜택 등록 및 서비스 이용이 가능합니다.
          </div>
        </div>

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
          {loading ? "등록 중..." : "등록"}
        </button>
      </div>

      {/* 3) 스캔 모달 */}
      {scanOpen && (
        <QrScanModal
          title="스마트 도어락 SN 스캔"
          onClose={() => setScanOpen(false)}
          onResult={(value) => {
            setSn(value);
            setScanOpen(false);
          }}
        />
      )}

      {/* 4) SN 위치 안내 모달 */}
      {snHelpOpen && (
        <SnLocationModal
          onClose={() => setSnHelpOpen(false)}
        />
      )}
    </div>
  );
}

const snHelpLinkStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#1d3129",
  textDecoration: "underline",
  fontSize: 12,
  cursor: "pointer",
};

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

// 选中按钮的灯光效果：品牌深绿 #1d3129 的亮一阶版本，从底部向上发散
const SELECTED_GLOW =
  "inset 0 -22px 30px -10px rgba(74,138,114,0.6), inset 0 -2px 0 rgba(74,138,114,0.95)";

function typeButtonStyle(active: boolean): React.CSSProperties {
  return {
    height: 44,
    borderRadius: 12,
    border: "1px solid #e4e4e7",
    background: "#fff",
    color: "#18181b",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: active ? SELECTED_GLOW : "none",
    transition: "box-shadow 200ms ease",
  };
}

const PRIMARY_BUTTON_SHADOW =
  "0 12px 28px rgba(29,49,41,0.45), 0 4px 10px rgba(29,49,41,0.25)";

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
    boxShadow: disabled ? "none" : PRIMARY_BUTTON_SHADOW,
    transform: disabled ? "none" : "translateY(-1px)",
    transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
  };
}

function minorButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 40,
    borderRadius: 10,
    border: "1px solid #1d3129",
    background: disabled ? "#f4f4f5" : "#1d3129",
    color: disabled ? "#a1a1aa" : "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 14px",
    fontSize: 13,
    transition: "background 120ms ease, color 120ms ease",
  };
}
