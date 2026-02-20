"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function normalizePhone(input: string) {
  return input.replace(/[^\d]/g, "");
}

export default function RegClient({ initialSn = "" }: { initialSn?: string }) {
  const router = useRouter();

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

      // 기존 코드가 success 페이지에서 이 값을 쓰면 그대로 유지
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
        <label style={{ display: "grid", gap: 6 }}>
          <span>제품 S/N</span>
          <input
            value={sn}
            onChange={(e) => setSn(e.target.value)}
            placeholder="예: A1B2C3D4..."
            style={{ height: 40, padding: "0 12px" }}
          />
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
    </div>
  );
}