"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import QrScanModal from "../../QrScanModal";
import SnLocationModal from "../../SnLocationModal";
import { consentBoxStyle, inputStyle, primaryButtonStyle, snHelpLinkStyle } from "../../regStyles";
import { getErrorMessage } from "@/lib/error";

// CJ 온스타일 배정 건 전용 등록 화면. 일반 /reg 와 달리 휴대폰 인증 · 기사 확인이 없다.
// 링크가 주문(전화번호 · 출고일)에 묶여 있어서 받는 값은 SN 과 설치 완료일뿐이다.

const ERROR_MESSAGE: Record<string, string> = {
  INVALID_LINK: "올바르지 않은 링크입니다. 문자로 받으신 링크를 다시 열어 주세요.",
  LINK_EXPIRED: "등록 기간이 지난 링크입니다.",
  LINK_ALREADY_USED: "이 주문은 이미 등록이 완료되었습니다.",
  SN_NOT_FOUND: "입력하신 SN(일련번호)이 올바르지 않습니다. 다시 확인해 주세요.",
  ALREADY_CONFIRMED: "이미 등록 완료된 SN(일련번호)입니다.",
  INVALID_SN: "올바르지 않은 SN(일련번호) 형식입니다.",
  INVALID_INSTALL_DATE: "올바른 설치 완료일을 선택해 주세요.",
  INSTALL_DATE_BEFORE_SHIP: "설치 완료일은 제품 출고일 이후여야 합니다.",
  INSTALL_DATE_IN_FUTURE: "설치 완료일은 미래 날짜일 수 없습니다.",
  CONSENT_REQUIRED: "필수 개인정보 동의가 필요합니다.",
};

export default function CjRegClient({
  token,
  phoneLabel,
  shipDate,
  today,
  expiresOn,
}: {
  token: string;
  phoneLabel: string;
  shipDate: string;
  today: string;
  expiresOn: string;
}) {
  const router = useRouter();

  const [scanOpen, setScanOpen] = useState(false);
  const [snHelpOpen, setSnHelpOpen] = useState(false);
  const [sn, setSn] = useState("");
  const [installDate, setInstallDate] = useState(today);
  const [consent, setConsent] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateOutOfRange = installDate < shipDate || installDate > today;
  const canSubmit =
    sn.trim().length >= 6 && installDate.length === 10 && !dateOutOfRange && consent && !loading;

  async function onSubmit() {
    setError(null);
    setLoading(true);

    try {
      const r = await fetch("/api/register/cj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sn: sn.trim(),
          installDate,
          consentPrivacy: consent,
          consentMarketing,
        }),
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        const errorCode = data?.error;
        if (errorCode === "SN_NOT_FOUND") {
          alert("SN (일련번호) 입력 오류\n\n입력하신 SN(일련번호)이 올바르지 않습니다. 기기 본체 또는 박스 라벨의 일련번호를 다시 확인해 주세요.");
        }
        setError(ERROR_MESSAGE[errorCode] ?? errorCode ?? "제출에 실패했습니다.");
        return;
      }

      sessionStorage.setItem("lastRegistrationId", data?.id ?? "");
      sessionStorage.setItem("lastRegistrationStatus", data?.status ?? "");
      sessionStorage.setItem("lastInstallType", data?.installType ?? "installer");
      sessionStorage.setItem("lastFreeAsEndDate", data?.freeAsEndDate ?? "");
      sessionStorage.setItem("lastInstallerPhone", data?.installerPhone ?? "");

      router.push("/success");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "제출에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        제품정보 등록 (무상 A/S 2년)
      </h1>
      <p style={{ fontSize: 13, color: "#52525b", lineHeight: 1.6, marginBottom: 14 }}>
        CJ온스타일에서 구매하신 도어락의 설치가 끝났다면 아래 정보를 입력해 주세요.
        등록하시면 설치일로부터 2년간 무상 A/S를 받으실 수 있습니다.
      </p>

      <div
        style={{
          borderRadius: 12,
          background: "#fff7ed",
          border: "1px solid #fdba74",
          color: "#9a3412",
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        아직 설치 전이시면 설치를 마치신 뒤 이 링크로 다시 들어와 등록해 주세요.
        <br />
        이 링크는 <b>{expiresOn}</b>까지 사용하실 수 있습니다.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>전화번호</span>
          <input value={phoneLabel} disabled style={{ ...inputStyle, background: "#f4f4f5" }} />
          <div style={{ fontSize: 12, opacity: 0.7 }}>주문 시 등록하신 번호로 등록됩니다.</div>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            제품 SN (일련번호)
            <button type="button" onClick={() => setSnHelpOpen(true)} style={snHelpLinkStyle}>
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
              style={{ height: 40, padding: "0 12px", fontWeight: 700, cursor: "pointer" }}
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
            min={shipDate}
            max={today}
            style={inputStyle}
          />
          {dateOutOfRange ? (
            <div style={{ color: "crimson", fontSize: 12 }}>
              설치 완료일은 {shipDate} ~ {today} 사이로 선택해 주세요.
            </div>
          ) : null}
        </label>

        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>[필수] 개인정보 수집 및 이용 동의</span>
            <Link
              href="/privacy"
              target="_blank"
              style={{ marginLeft: "auto", fontSize: 12, color: "#71717a", textDecoration: "underline" }}
            >
              약관 보기
            </Link>
          </label>
          <div style={consentBoxStyle}>
            • <b>수집/이용 목적:</b> 무상 A/S 서비스 제공 및 설치 등록 확인<br />
            • <b>수집 항목:</b> 휴대폰 번호, 제품 및 설치 정보(제품 일련번호, 설치 완료일, 주문번호, 설치 업체 연락처)<br />
            • <b>보유/이용 기간:</b> <b>등록일로부터 무상 A/S 기간(2년) 만료 시까지, 만료 후 즉시 파기</b><br />
            • 귀하는 동의를 거부할 권리가 있으나, 거부 시 무상 A/S 혜택 등록 및 서비스 제공이 불가합니다.
          </div>
        </div>

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
          <div style={consentBoxStyle}>
            • <b>수집/이용 목적:</b> 신제품 및 서비스 안내, 이벤트/프로모션 혜택 전송<br />
            • <b>수집 항목:</b> 휴대폰 번호<br />
            • <b>보유/이용 기간:</b> <b>동의 철회 시 또는 서비스 종료 시까지</b><br />
            • 동의하지 않으셔도 무상 A/S 혜택 등록 및 서비스 이용이 가능합니다.
          </div>
        </div>

        {error ? <div style={{ color: "crimson", fontSize: 13 }}>{error}</div> : null}

        <button disabled={!canSubmit} onClick={onSubmit} style={primaryButtonStyle(!canSubmit)}>
          {loading ? "등록 중..." : "등록"}
        </button>
      </div>

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

      {snHelpOpen && <SnLocationModal onClose={() => setSnHelpOpen(false)} />}
    </div>
  );
}
