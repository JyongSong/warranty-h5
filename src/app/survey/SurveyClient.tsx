"use client";

import { useMemo, useState } from "react";
import Script from "next/script";
import { normalizePhone, formatKrPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: {
        oncomplete: (data: { zonecode: string; address: string }) => void;
      }) => { open: () => void };
    };
  }
}

const ABILITY_OPTIONS = ["도어락", "도어벨", "월패드 연동기"] as const;
const WALLPAD_BRIDGE = "월패드 연동기";

const ABILITY_TO_CAPABILITY: Record<string, string> = {
  "도어락": "DOORLOCK",
  "도어벨": "DOORBELL",
  "월패드 연동기": "WALLPAD_HUB",
};

const AQARA_APP_LEVELS = [
  { value: "none", label: "Aqara 앱 설치 불가", capability: "NONE" },
  { value: "app", label: "도어락 설치 + Aqara 앱 연동 가능", capability: "DOORLOCK_AND_APP" },
  { value: "hub", label: "도어락 설치 + Aqara 앱 연동 + Aqara 허브 연동 가능", capability: "DOORLOCK_AND_APP_AND_HUB" },
] as const;

type AqaraAppLevel = (typeof AQARA_APP_LEVELS)[number]["value"];

export default function SurveyClient() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("");
  const [region, setRegion] = useState("");
  const [coverage, setCoverage] = useState("");
  const [zonecode, setZonecode] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [abilities, setAbilities] = useState<string[]>([]);
  const [abilityEtcChecked, setAbilityEtcChecked] = useState(false);
  const [abilityEtc, setAbilityEtc] = useState("");
  const [aqaraDoorlockBridge, setAqaraDoorlockBridge] = useState<"yes" | "no" | "">("");
  const [aqaraAppLevel, setAqaraAppLevel] = useState<AqaraAppLevel | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [updated, setUpdated] = useState(false);

  const wallpadSelected = abilities.includes(WALLPAD_BRIDGE);
  const hasAbilitySelection = abilities.length > 0 || abilityEtcChecked;

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!name.trim()) return false;
    if (normalizePhone(phone).length < 9) return false;
    if (!hasAbilitySelection) return false;
    if (wallpadSelected && !aqaraDoorlockBridge) return false;
    if (!aqaraAppLevel) return false;
    return true;
  }, [
    loading,
    name,
    phone,
    hasAbilitySelection,
    wallpadSelected,
    aqaraDoorlockBridge,
    aqaraAppLevel,
  ]);

  function toggleAbility(item: string) {
    setAbilities((prev) => {
      const next = prev.includes(item)
        ? prev.filter((a) => a !== item)
        : [...prev, item];
      if (item === WALLPAD_BRIDGE && !next.includes(WALLPAD_BRIDGE)) {
        setAqaraDoorlockBridge("");
      }
      return next;
    });
  }

  function openPostcode() {
    if (!window.daum) return;
    new window.daum.Postcode({
      oncomplete(data) {
        setZonecode(data.zonecode);
        setAddress(data.address);
      },
    }).open();
  }

  async function onSubmit() {
    setLoading(true);
    setError(null);

    const fullAddress = [zonecode, address, addressDetail.trim()]
      .filter(Boolean)
      .join(" ");

    const capabilities = abilities
      .map((a) => ABILITY_TO_CAPABILITY[a])
      .filter((c): c is string => Boolean(c));
    if (abilityEtcChecked) capabilities.push("OTHER");

    const serviceAreas = coverage
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const aqaraAppCapability =
      AQARA_APP_LEVELS.find((l) => l.value === aqaraAppLevel)?.capability ?? "NONE";

    const hasAqaraHubInventory = wallpadSelected && aqaraDoorlockBridge === "yes";

    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          branch: branch.trim(),
          region: region.trim(),
          coverage: coverage.trim(),
          address: fullAddress || undefined,
          ability: (() => {
            const list = [...abilities];
            if (abilityEtcChecked && abilityEtc.trim()) {
              list.push(`기타: ${abilityEtc.trim()}`);
            } else if (abilityEtcChecked) {
              list.push("기타");
            }
            if (wallpadSelected && aqaraDoorlockBridge) {
              list.push(
                `Aqara 도어락용 연동기: ${aqaraDoorlockBridge === "yes" ? "보유" : "미보유"}`,
              );
            }
            if (aqaraAppLevel) {
              const label = AQARA_APP_LEVELS.find((l) => l.value === aqaraAppLevel)?.label;
              if (label) list.push(`Aqara 앱 연동/설정 서비스: ${label}`);
            }
            return list.length > 0 ? list.join(", ") : undefined;
          })(),
          serviceAreas,
          capabilities,
          aqaraAppCapability,
          hasAqaraHubInventory,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const messages: Record<string, string> = {
          NAME_REQUIRED: "이름을 입력해 주세요.",
          INVALID_PHONE: "올바른 전화번호를 입력해 주세요.",
        };
        setError(messages[json.error] ?? "제출에 실패했습니다.");
        return;
      }

      setUpdated(json.updated);
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, "제출에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>제출 완료 ✅</h1>
        <p style={{ opacity: 0.85, lineHeight: 1.6 }}>
          {updated
            ? "기존 정보가 업데이트되었습니다. 감사합니다!"
            : "설문이 정상적으로 등록되었습니다. 감사합니다!"}
        </p>
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontSize: 15,
    boxSizing: "border-box",
  };

  const fieldGap: React.CSSProperties = { marginBottom: 18 };

  return (
    <>
      <Script
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="lazyOnload"
      />

      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          설치 기사 설문
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 24, lineHeight: 1.5 }}>
          아래 정보를 입력해 주세요. <span style={{ color: "#e53e3e" }}>*</span> 표시는 필수 항목입니다.
        </p>

        {/* 이름 */}
        <div style={fieldGap}>
          <label style={labelStyle}>
            이름 <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <input
            style={inputStyle}
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* 전화번호 */}
        <div style={fieldGap}>
          <label style={labelStyle}>
            전화번호 <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <input
            style={inputStyle}
            placeholder="010-1234-5678"
            value={formatKrPhone(phone)}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
        </div>

        {/* 소속 */}
        <div style={fieldGap}>
          <label style={labelStyle}>소속</label>
          <input
            style={inputStyle}
            placeholder="소속 회사 또는 팀"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>

        {/* 광역 */}
        <div style={fieldGap}>
          <label style={labelStyle}>광역</label>
          <input
            style={inputStyle}
            placeholder="예: 서울, 경기, 충북 등"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>

        {/* 출장 가능 지역 */}
        <div style={fieldGap}>
          <label style={labelStyle}>출장 가능 지역</label>
          <input
            style={inputStyle}
            placeholder="예: 서울 강남구, 부천시, 청주시 등"
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
          />
        </div>

        {/* 주소 (Daum 우편번호 검색) */}
        <div style={fieldGap}>
          <label style={labelStyle}>주소</label>
          <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8, marginTop: 0 }}>
            설치 배정 참고를 위해 주소를 입력해 주세요.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="우편번호"
              value={zonecode}
              readOnly
            />
            <button
              type="button"
              onClick={openPostcode}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              우편번호 검색
            </button>
          </div>
          <input
            style={{ ...inputStyle, marginBottom: 8 }}
            placeholder="기본 주소"
            value={address}
            readOnly
          />
          <input
            style={inputStyle}
            placeholder="상세 주소 입력"
            value={addressDetail}
            onChange={(e) => setAddressDetail(e.target.value)}
          />
        </div>

        {/* 설치 가능 항목 (다중 선택) */}
        <div style={fieldGap}>
          <label style={labelStyle}>
            설치 가능 항목 <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            {ABILITY_OPTIONS.map((item) => (
              <label
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={abilities.includes(item)}
                  onChange={() => toggleAbility(item)}
                  style={{ width: 18, height: 18 }}
                />
                {item}
              </label>
            ))}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={abilityEtcChecked}
                onChange={(e) => {
                  setAbilityEtcChecked(e.target.checked);
                  if (!e.target.checked) setAbilityEtc("");
                }}
                style={{ width: 18, height: 18 }}
              />
              기타
            </label>
          </div>
          {abilityEtcChecked && (
            <input
              style={inputStyle}
              placeholder="기타 설치 가능 항목을 입력해 주세요"
              value={abilityEtc}
              onChange={(e) => setAbilityEtc(e.target.value)}
            />
          )}
          {wallpadSelected && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                background: "#f7f7f8",
                border: "1px solid #ececef",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Aqara 도어락용 연동기를 보유하고 계신가요?
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {[
                  { value: "yes", label: "보유" },
                  { value: "no", label: "미보유" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="aqaraDoorlockBridge"
                      checked={aqaraDoorlockBridge === opt.value}
                      onChange={() =>
                        setAqaraDoorlockBridge(opt.value as "yes" | "no")
                      }
                      style={{ width: 16, height: 16 }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Aqara 앱 설정 가능 여부 */}
        <div style={fieldGap}>
          <label style={labelStyle}>
            Aqara 앱 연동/설정 서비스 가능 여부 <span style={{ color: "#e53e3e" }}>*</span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AQARA_APP_LEVELS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="aqaraAppLevel"
                  checked={aqaraAppLevel === opt.value}
                  onChange={() => setAqaraAppLevel(opt.value)}
                  style={{ width: 16, height: 16 }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#fff5f5",
              color: "#c53030",
              padding: 12,
              borderRadius: 10,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            background: canSubmit ? "#111" : "#ccc",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "제출 중..." : "제출하기"}
        </button>
      </div>
    </>
  );
}
