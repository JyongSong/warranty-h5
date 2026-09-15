"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import type { CSSProperties } from "react";
import { formatKrPhone } from "@/lib/phone";
import {
  AQARA_APP_CHOICES,
  AS_EMERGENCY_CHOICES,
  CAPABILITY_LABEL_KO,
} from "@/lib/installer/profile-input";
import { Row } from "../../cards";
import * as ui from "../../ui";
import { saveInstallerProfileAction } from "./actions";

const ERROR_LABEL: Record<string, string> = {
  NAME_REQUIRED: "이름을 입력해 주세요.",
  ADDRESS_REQUIRED: "주소를 입력해 주세요.",
  AQARA_APP_CAPABILITY_REQUIRED: "Aqara 앱 연동 능력을 선택해 주세요.",
  AS_EMERGENCY_REQUIRED: "A/S 긴급출동 가능 여부를 선택해 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다. 다시 로그인해 주세요.",
  SAVE_FAILED: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

type Profile = {
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  address: string | null;
  serviceAreas: string[];
  capabilities: string[];
  aqaraAppCapability: string;
  asEmergencyAvailability: string | null;
  confirmed: boolean;
};

export default function ProfileEditClient({ profile }: { profile: Profile }) {
  const router = useRouter();

  const [name, setName] = useState(profile.name ?? "");
  // 주소는 우편번호 검색으로 채운 부분과 기사가 직접 쓰는 상세 주소로 나눈다.
  // 기존 값은 어디까지가 검색 결과인지 알 수 없으므로 통째로 상세 칸에 넣는다.
  const [baseAddress, setBaseAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState(profile.address ?? "");
  const [aqara, setAqara] = useState(profile.aqaraAppCapability ?? "");
  const [asEmergency, setAsEmergency] = useState(profile.asEmergencyAvailability ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const address = [baseAddress, addressDetail.trim()].filter(Boolean).join(" ").trim();
  const canSubmit = Boolean(name.trim() && address && aqara && asEmergency) && !saving;

  function openPostcode() {
    if (!window.daum) return;
    new window.daum.Postcode({
      oncomplete(data) {
        setBaseAddress(`${data.zonecode} ${data.address}`);
        setAddressDetail("");
      },
    }).open();
  }

  async function onSubmit() {
    setSaving(true);
    setError(null);

    const res = await saveInstallerProfileAction({
      name: name.trim(),
      address,
      aqaraAppCapability: aqara,
      asEmergencyAvailability: asEmergency,
    });

    setSaving(false);
    if (res.ok) {
      setDone(true);
      router.refresh();
      return;
    }
    setError(ERROR_LABEL[res.error] ?? ERROR_LABEL.SAVE_FAILED);
  }

  if (done) {
    return (
      <main style={ui.page}>
        <div style={ui.panel}>
          <h1 style={ui.h1}>제출 완료</h1>
          <p style={{ fontSize: 14, color: "#3f3f46", lineHeight: 1.7, marginTop: 8 }}>
            정보가 저장되었습니다. 감사합니다.
            <br />
            변경할 내용이 생기면 이 화면에서 다시 수정하실 수 있습니다.
          </p>
          <button type="button" style={ui.secondaryButton} onClick={() => setDone(false)}>
            다시 보기
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Script
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="lazyOnload"
      />

      <main style={ui.page}>
        <div style={ui.panel}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ ...ui.h1, marginBottom: 2 }}>내 정보 확인</h1>
            <div style={{ fontSize: 13, color: "#71717a" }}>
              {profile.confirmed
                ? "이미 제출하셨습니다. 수정 후 다시 저장하실 수 있습니다."
                : "아래 항목을 확인하고 채워 주세요."}
            </div>
          </div>

          {/* 배차 기준이라 기사가 바꿀 수 없는 항목. 확인만 할 수 있게 보여준다. */}
          <div style={ui.card}>
            <div style={sectionTitle}>등록된 정보</div>
            <Row label="연락처" value={formatKrPhone(profile.phone)} />
            <Row label="소속" value={profile.branch?.trim() || "-"} />
            <Row label="담당 지역" value={formatList(profile.serviceAreas)} />
            <Row
              label="설치 가능 항목"
              value={formatList(profile.capabilities.map((c) => CAPABILITY_LABEL_KO[c] ?? c))}
            />
            <p style={readonlyNote}>
              담당 지역과 설치 가능 항목은 배차 기준이라 이 화면에서는 바꿀 수 없습니다.
              변경이 필요하시면 본사 담당자에게 알려 주세요.
            </p>
          </div>

          <div style={ui.card}>
            <div style={sectionTitle}>이름 (실명)</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="실명을 입력해 주세요"
              style={input}
            />
            <p style={hint}>상호가 아닌 실제 성함을 적어 주세요.</p>
          </div>

          <div style={ui.card}>
            <div style={sectionTitle}>주소</div>
            <button type="button" onClick={openPostcode} style={ui.secondaryButton}>
              주소 검색
            </button>
            {baseAddress ? <div style={baseAddressBox}>{baseAddress}</div> : null}
            <input
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder={baseAddress ? "상세 주소 (동/호수 등)" : "주소를 입력해 주세요"}
              style={{ ...input, marginTop: 8 }}
            />
          </div>

          <div style={ui.card}>
            <div style={sectionTitle}>Aqara 앱 연동 능력</div>
            <ChoiceList
              options={AQARA_APP_CHOICES}
              value={aqara}
              onChange={setAqara}
            />
          </div>

          <div style={ui.card}>
            <div style={sectionTitle}>A/S 긴급출동 가능 여부</div>
            <ChoiceList
              options={AS_EMERGENCY_CHOICES}
              value={asEmergency}
              onChange={setAsEmergency}
            />
          </div>

          {error ? <div style={errorBox}>{error}</div> : null}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={ui.primaryButton(!canSubmit)}
          >
            {saving ? "저장 중…" : "제출"}
          </button>
        </div>
      </main>
    </>
  );
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "-";
}

function ChoiceList({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              ...choice,
              borderColor: selected ? "#111" : "#e4e4e7",
              background: selected ? "#111" : "#fff",
              color: selected ? "#fff" : "#3f3f46",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#3f3f46",
  marginBottom: 10,
};

const input: CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  padding: "0 12px",
  fontSize: 15,
  color: "#18181b",
  boxSizing: "border-box",
};

const baseAddressBox: CSSProperties = {
  marginTop: 8,
  borderRadius: 10,
  background: "#f4f4f5",
  padding: "10px 12px",
  fontSize: 14,
  color: "#3f3f46",
  lineHeight: 1.5,
};

const choice: CSSProperties = {
  minHeight: 48,
  borderRadius: 10,
  border: "1px solid",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "center",
};

const hint: CSSProperties = { fontSize: 12, color: "#a1a1aa", marginTop: 6, lineHeight: 1.5 };

const readonlyNote: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  marginTop: 10,
  lineHeight: 1.6,
};

const errorBox: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  color: "#991b1b",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  marginBottom: 10,
};
