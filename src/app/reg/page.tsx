"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function normalizePhone(input: string) {
  return input.replace(/[^\d]/g, "");
}

export default function RegPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const snFromQuery = sp.get("sn") ?? "";

  const [sn, setSn] = useState(snFromQuery);
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
      // 先不接后端：直接跳到 success（后面我们再接 /api/register）
      const payload = {
        sn: sn.trim(),
        installDate,
        userPhone: normalizePhone(userPhone),
        installerPhone: normalizePhone(installerPhone),
        consentPrivacy: consent,
      };

      // 临时：把数据塞到 sessionStorage，方便你看 confirm 页展示
      const r = await fetch("api/register",{
        method: "Post",
        headers: {"Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      console.log("API response", r.status, data);

      if (!r.ok) {
        setError(data?.error ??"제출실패");
        return;
      }
      sessionStorage.setItem("lastRegistrationId",data.id);
      sessionStorage.setItem("lastConfirmLink", data.ConfirmLink);

      router.push("/success");
    } catch (e: any) {
      setError(e?.message ?? "재출실패");
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
        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>디바이스 SN(필수)</div>
          <input
            value={sn}
            onChange={(e) => setSn(e.target.value)}
            placeholder="내기핸들 우측에 있습니다."
            style={inputStyle}
          />
        </label>

        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>설치날짜 (필수)</div>
          <input
            type="date"
            value={installDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setInstallDate(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>고객 전화</div>
          <input
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="01012345678"
            inputMode="numeric"
            style={inputStyle}
          />
        </label>

        <label>
          <div style={{ fontSize: 14, marginBottom: 6 }}>설치기사님 전화 (필수)</div>
          <input
            value={installerPhone}
            onChange={(e) => setInstallerPhone(e.target.value)}
            placeholder="01098765432"
            inputMode="numeric"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span style={{ fontSize: 14 }}>
            동의합니다 <a href="/privacy">개인전보 수신동의</a>(필수)
          </span>
        </label>

        {error && (
          <div style={{ background: "#fee", padding: 10, borderRadius: 8, fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          disabled={!canSubmit}
          onClick={onSubmit}
          style={{
            ...btnStyle,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "재출 중..." : "정보 재출"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
          제출 완료 후, 시스템이 기사님의 휴대폰 번호로 ‘설치 완료 확인 링크’를 발송하며, 기사님이 확인을 완료하면 무상 A/S 기간이 적용됩니다.
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 10,
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  fontSize: 15,
  fontWeight: 700,
};