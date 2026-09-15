"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import type { CSSProperties, ReactNode } from "react";
import { formatKrPhone } from "@/lib/phone";
import {
  AQARA_APP_CHOICES,
  AS_EMERGENCY_CHOICES,
  CAPABILITY_LABEL_KO,
} from "@/lib/installer/profile-input";
import { Row } from "@/app/installer/cards";
import * as ui from "@/app/installer/ui";

// 화면에서 반드시 채워야 하는 항목 수. 안내 문구가 실제와 어긋나지 않게 한곳에서 센다.
const REQUIRED_COUNT = 5;

const ERROR_LABEL: Record<string, string> = {
  NAME_REQUIRED: "이름을 입력해 주세요.",
  BRANCH_REQUIRED: "상호명을 입력해 주세요.",
  ADDRESS_REQUIRED: "주소를 입력해 주세요.",
  AQARA_APP_CAPABILITY_REQUIRED: "Aqara 앱 연동 능력을 선택해 주세요.",
  AS_EMERGENCY_REQUIRED: "A/S 긴급출동 가능 여부를 선택해 주세요.",
  UNAUTHORIZED: "로그인이 필요합니다. 다시 로그인해 주세요.",
  SESSION_EXPIRED: "인증 후 시간이 지났습니다. 화면을 새로고침해 다시 인증해 주세요.",
  SAVE_FAILED: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export type Profile = {
  name: string;
  phone: string;
  branch: string | null;
  region: string | null;
  address: string | null;
  capabilities: string[];
  aqaraAppCapability: string;
  asEmergencyAvailability: string | null;
  confirmed: boolean;
};

/**
 * 기사 본인 정보 입력 폼. 두 곳에서 쓴다.
 *  - /i/p            문자 링크로 들어온 기사 (앱 세션 없이 휴대폰 인증만)
 *  - /installer/me/edit  기사 앱 사용자
 * 저장 동작만 다르므로 onSave 로 주입받는다.
 */
export default function ProfileForm({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (input: {
    name: string;
    branch: string;
    address: string;
    aqaraAppCapability: string;
    asEmergencyAvailability: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();

  const [name, setName] = useState(profile.name ?? "");
  // 총판 명단의 상호명을 미리 채워 두고, 맞는지 본인이 확인·수정하게 한다.
  const [branch, setBranch] = useState(profile.branch ?? "");
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

  const missing = [
    name.trim() ? null : "이름",
    branch.trim() ? null : "상호명",
    address ? null : "주소",
    aqara ? null : "Aqara 앱 연동 능력",
    asEmergency ? null : "A/S 긴급출동 가능 여부",
  ].filter((label): label is string => label !== null);

  const canSubmit = missing.length === 0 && !saving;

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

    const res = await onSave({
      name: name.trim(),
      branch: branch.trim(),
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
                : `필수 항목 ${REQUIRED_COUNT}가지를 모두 채워 주세요.`}
            </div>
          </div>

          {/* 이 화면에서 고칠 수 없는 항목만 둔다. 아래에서 고치는 항목(실명·상호·주소)을
              여기에도 늘어놓으면, 고친 뒤에도 위에는 예전 값이 남아 저장이 안 된 것처럼 보인다. */}
          <div style={ui.card}>
            <SectionTitle>등록된 정보</SectionTitle>
            <Row label="연락처" value={formatKrPhone(profile.phone)} />
            <Row
              label="설치 가능 항목"
              value={formatList(profile.capabilities.map((c) => CAPABILITY_LABEL_KO[c] ?? c))}
            />
            <p style={readonlyNote}>
              연락처·설치 가능 항목·담당 지역은 배차 기준이라 이 화면에서는 바꿀 수 없습니다.
              변경이 필요하시면 본사 담당자에게 알려 주세요.
            </p>
          </div>

          <div style={ui.card}>
            <SectionTitle required>이름 (실명)</SectionTitle>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="실명을 입력해 주세요"
              style={input}
            />
            <p style={hint}>상호가 아닌 실제 성함을 적어 주세요.</p>
          </div>

          <div style={ui.card}>
            <SectionTitle required>상호명</SectionTitle>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="상호명을 입력해 주세요"
              style={input}
            />
            <p style={hint}>
              등록된 상호명이 맞는지 확인해 주세요. 다르면 정확한 상호명으로 고쳐 주세요.
            </p>
          </div>

          <div style={ui.card}>
            <SectionTitle required>주소</SectionTitle>
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
            <p style={hint}>
              {baseAddress
                ? "동/호수 등 상세 주소를 입력해 주세요."
                : profile.address
                  ? "등록된 주소입니다. 바꾸시려면 '주소 검색' 을 눌러 주세요."
                  : "'주소 검색' 으로 주소를 찾은 뒤 상세 주소를 입력해 주세요."}
            </p>
          </div>

          <div style={ui.card}>
            <SectionTitle required>Aqara 앱 연동 능력</SectionTitle>
            <ChoiceList
              name="aqaraAppCapability"
              options={AQARA_APP_CHOICES}
              value={aqara}
              onChange={setAqara}
            />
          </div>

          <div style={ui.card}>
            <SectionTitle required>A/S 긴급출동 가능 여부</SectionTitle>
            <ChoiceList
              name="asEmergencyAvailability"
              options={AS_EMERGENCY_CHOICES}
              value={asEmergency}
              onChange={setAsEmergency}
            />
          </div>

          {error ? <div style={errorBox}>{error}</div> : null}

          {missing.length > 0 ? (
            <div style={missingBox}>아직 입력하지 않은 필수 항목: {missing.join(", ")}</div>
          ) : null}

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

function SectionTitle({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <div style={sectionTitle}>
      <span>{children}</span>
      {required ? <span style={requiredBadge}>필수</span> : null}
    </div>
  );
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "-";
}

/**
 * 한 가지만 고르는 항목. 라디오 버튼으로 둔다.
 *
 * 처음에는 고른 항목을 검은 버튼으로 칠했는데, 나머지 항목도 버튼처럼 보여서
 * "고른 것" 인지 "누를 수 있는 것" 인지 구분이 안 된다는 이야기가 나왔다.
 * 동그라미 표시가 있으면 한눈에 갈린다.
 */
function ChoiceList({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            style={{
              ...choice,
              borderColor: selected ? "#111" : "#e4e4e7",
              background: selected ? "#f4f4f5" : "#fff",
            }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              style={radio}
            />
            <span style={{ fontWeight: selected ? 800 : 500, color: "#18181b" }}>
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const sectionTitle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "#3f3f46",
  marginBottom: 10,
};

const requiredBadge: CSSProperties = {
  borderRadius: 4,
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  color: "#b91c1c",
  fontSize: 11,
  fontWeight: 800,
  padding: "1px 5px",
  lineHeight: 1.5,
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
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 48,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid",
  fontSize: 15,
  cursor: "pointer",
};

const radio: CSSProperties = {
  width: 20,
  height: 20,
  margin: 0,
  flexShrink: 0,
  accentColor: "#111",
  cursor: "pointer",
};

const hint: CSSProperties = { fontSize: 12, color: "#a1a1aa", marginTop: 6, lineHeight: 1.5 };

const readonlyNote: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  marginTop: 10,
  lineHeight: 1.6,
};

const missingBox: CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde047",
  color: "#854d0e",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.6,
  marginBottom: 10,
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
