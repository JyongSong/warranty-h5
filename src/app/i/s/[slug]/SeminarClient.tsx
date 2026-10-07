"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { formatKrPhone, normalizePhone } from "@/lib/phone";
import { parseSeminarContacts } from "@/lib/seminar/state";
import {
  cancelSeminarAction,
  lookupSeminarAction,
  registerSeminarAction,
  type LookupResult,
} from "./actions";

// 세미나 안내 + 참석 신청. 번호를 넣으면 가린 이름이 나오고, 본인이 맞으면 신청한다.
// 접수가 닫힌 뒤에도 번호 입력은 남겨 둔다 — 이미 신청한 사람이 내역을 확인하고
// 취소할 수 있어야 하기 때문이다.

type SeminarInfo = {
  title: string;
  description: string | null;
  scheduleText: string;
  venue: string;
  venueNote: string | null;
  attendanceNote: string | null;
  programItems: string[];
  parkingInfo: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

type Lookup = Extract<LookupResult, { ok: true }>;
type Notice = { tone: "ok" | "info"; text: string };

const ERROR_LABEL: Record<string, string> = {
  INVALID_PHONE: "휴대폰 번호를 다시 확인해 주세요.",
  INSTALLER_NOT_FOUND: "등록된 번호가 아닙니다. 문자를 받으신 번호로 입력해 주세요.",
  SEMINAR_FULL: "접수가 마감되었습니다.",
  SEMINAR_CLOSED: "접수가 마감되었습니다.",
  CANCEL_CLOSED: "취소 가능 시간이 지났습니다. 문의 전화로 연락해 주세요.",
  NOT_REGISTERED: "신청 내역이 없습니다.",
  FAILED: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function SeminarClient({
  slug,
  open: initialOpen,
  seminar,
}: {
  slug: string;
  open: boolean;
  seminar: SeminarInfo;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const normalized = normalizePhone(phone);
  const phoneReady = normalized.length >= 10;

  function fail(code: string) {
    setError(ERROR_LABEL[code] ?? ERROR_LABEL.FAILED);
    // 신청하려는 사이에 자리가 찼다. 화면 위쪽 표시도 맞춘다.
    if (code === "SEMINAR_FULL" || code === "SEMINAR_CLOSED") setOpen(false);
  }

  async function refresh(): Promise<boolean> {
    const res = await lookupSeminarAction(slug, normalized);
    if (!res.ok) {
      fail(res.error);
      return false;
    }
    setLookup(res);
    setOpen(res.state === "OPEN");
    return true;
  }

  async function onLookup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    await refresh();
    setBusy(false);
  }

  async function onRegister() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await registerSeminarAction(slug, normalized);
    if (res.ok) {
      if (await refresh()) {
        setNotice({ tone: "ok", text: "참석 신청이 완료되었습니다. 확인 문자를 보내 드렸습니다." });
      }
    } else {
      fail(res.error);
      if (res.error === "SEMINAR_FULL" || res.error === "SEMINAR_CLOSED") {
        setLookup((prev) => (prev ? { ...prev, state: "CLOSED" } : prev));
      }
    }
    setBusy(false);
  }

  async function onCancel() {
    if (!window.confirm("참석 신청을 취소하시겠습니까?")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await cancelSeminarAction(slug, normalized);
    if (res.ok) {
      if (await refresh()) setNotice({ tone: "info", text: "참석 신청이 취소되었습니다." });
    } else {
      fail(res.error);
    }
    setBusy(false);
  }

  function reset() {
    setLookup(null);
    setError(null);
    setNotice(null);
  }

  const contacts = parseSeminarContacts(seminar.contactName, seminar.contactPhone);
  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(seminar.venue.replace(/\s*\d+호$/, ""))}`;

  return (
    <main style={page}>
      <header style={hero}>
        <div style={heroInner}>
          <div style={eyebrow}>AQARA PARTNER SEMINAR</div>
          <h1 style={heroTitle}>{seminar.title}</h1>
          {seminar.description ? <p style={heroSub}>{seminar.description}</p> : null}
          <span style={open ? statusOpen : statusClosed}>
            <span style={{ ...statusDot, background: open ? "#34d399" : "#a1a1aa" }} />
            {open ? "접수 중" : "접수 마감"}
          </span>
        </div>
      </header>

      <div style={body}>
        <section style={{ ...card, padding: "4px 18px" }}>
          <InfoRow icon="calendar" label="일시" value={seminar.scheduleText} />
          <InfoRow
            icon="pin"
            label="장소"
            value={seminar.venue}
            note={seminar.venueNote}
            extra={
              <a href={mapUrl} target="_blank" rel="noreferrer" style={chipLink}>
                지도 보기
              </a>
            }
          />
          {seminar.attendanceNote ? <InfoRow icon="people" label="참석" value={seminar.attendanceNote} /> : null}
          {seminar.parkingInfo ? <InfoRow icon="car" label="주차 안내" value={seminar.parkingInfo} /> : null}
          {contacts.length > 0 ? (
            <InfoRow
              icon="phone"
              label="문의 전화"
              value={contacts.map((contact) => (
                <div key={contact.phone} style={contactLine}>
                  <span>{[contact.name, formatKrPhone(contact.phone)].filter(Boolean).join(" ")}</span>
                  <a href={`tel:${contact.phone}`} style={chipLink}>
                    전화 걸기
                  </a>
                </div>
              ))}
              last
            />
          ) : null}
        </section>

        {seminar.programItems.length > 0 ? (
          <section style={card}>
            <h2 style={cardTitle}>주요 프로그램</h2>
            <ol style={programList}>
              {seminar.programItems.map((item, index) => (
                <li key={item} style={programItem}>
                  <span style={programNo}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={programText}>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section style={{ ...card, ...applyCard }}>
          <h2 style={cardTitle}>{open ? "참석 신청" : "신청 내역 확인"}</h2>

          {notice ? <div style={notice.tone === "ok" ? okBox : infoBox}>{notice.text}</div> : null}

          {!lookup ? (
            <>
              {!open ? (
                <p style={hint}>접수가 마감되었습니다. 이미 신청하신 분은 번호로 내역을 확인할 수 있습니다.</p>
              ) : null}
              <label style={label} htmlFor="seminar-phone">
                휴대폰 번호
              </label>
              <input
                id="seminar-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phoneReady && !busy) onLookup();
                }}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                style={input}
              />
              {error ? <div style={errorBox}>{error}</div> : null}
              <button
                type="button"
                onClick={onLookup}
                disabled={busy || !phoneReady}
                style={primaryButton(busy || !phoneReady)}
              >
                {busy ? "확인 중…" : "확인"}
              </button>
            </>
          ) : (
            <>
              <div style={identity}>
                <div style={avatar}>{Array.from(lookup.maskedName)[0]}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{lookup.maskedName}</div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                    {[lookup.region, formatKrPhone(normalized)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {lookup.registered ? <span style={doneBadge}>신청 완료</span> : null}
              </div>

              {error ? <div style={errorBox}>{error}</div> : null}

              {lookup.registered ? (
                lookup.canCancel ? (
                  <button type="button" onClick={onCancel} disabled={busy} style={secondaryButton}>
                    {busy ? "처리 중…" : "참석 취소"}
                  </button>
                ) : (
                  <p style={hint}>취소 가능 시간이 지났습니다. 변경은 문의 전화로 연락해 주세요.</p>
                )
              ) : lookup.state === "OPEN" ? (
                <>
                  <p style={hint}>본인이 맞으면 아래 버튼을 눌러 신청을 완료해 주세요.</p>
                  <button type="button" onClick={onRegister} disabled={busy} style={primaryButton(busy)}>
                    {busy ? "신청 중…" : "참석 신청"}
                  </button>
                </>
              ) : error ? null : (
                <div style={infoBox}>접수가 마감되었습니다.</div>
              )}

              <button type="button" onClick={reset} disabled={busy} style={textButton}>
                번호 다시 입력
              </button>
            </>
          )}
        </section>

        <p style={footer}>아카라라이프 도어락사업팀</p>
      </div>
    </main>
  );
}

type IconName = "calendar" | "pin" | "people" | "car" | "phone";

const ICON_PATH: Record<IconName, string> = {
  calendar: "M6 3v3M14 3v3M3.5 8.5h13M5 5h10a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 15 16.5H5A1.5 1.5 0 0 1 3.500 15V6.5A1.5 1.5 0 0 1 5 5z",
  pin: "M10 17.5s5.500-4.700 5.500-9a5.500 5.500 0 0 0-11 0c0 4.300 5.500 9 5.500 9zM10 10.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  people: "M7.500 9a2.750 2.750 0 1 0 0-5.500 2.750 2.750 0 0 0 0 5.500zM2.500 16.500v-.500a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v.500M13.500 9a2.250 2.250 0 1 0 0-4.500M15 12.200a3.500 3.500 0 0 1 2.500 3.300v1",
  car: "M4 11.500l1.300-4A1.500 1.500 0 0 1 6.700 6.500h6.600a1.500 1.500 0 0 1 1.400 1l1.300 4M4 11.500h12a1 1 0 0 1 1 1V15H3v-2.500a1 1 0 0 1 1-1zM5 15v1.500M15 15v1.500M6 13.250h.010M14 13.250h.010",
  phone: "M4.500 3.500h2.300l1.200 3.300-1.600 1.200a9 9 0 0 0 5.600 5.600l1.200-1.600 3.300 1.200v2.300a1.500 1.500 0 0 1-1.600 1.500A13 13 0 0 1 3 5.100a1.500 1.500 0 0 1 1.500-1.600z",
};

function InfoRow({
  icon,
  label: rowLabel,
  value,
  note,
  extra,
  last = false,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  note?: string | null;
  extra?: ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ ...infoRow, borderBottom: last ? "none" : `1px solid ${LINE}` }}>
      <span style={iconWrap} aria-hidden="true">
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
          <path d={ICON_PATH[icon]} stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={infoLabel}>{rowLabel}</div>
        <div style={infoValue}>{value}</div>
        {note ? <div style={infoNote}>{note}</div> : null}
      </div>
      {extra ? <div style={{ flexShrink: 0, alignSelf: "center" }}>{extra}</div> : null}
    </div>
  );
}

// 기사 앱 화면(ui.ts)과 달리 문자로 처음 만나는 초대장이라, 이 화면만의 색을 쓴다.
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#eef1f5";
const ACCENT = "#2563eb";

const FONT =
  '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f3f5f9",
  color: INK,
  fontFamily: FONT,
  paddingBottom: "calc(32px + env(safe-area-inset-bottom))",
  wordBreak: "keep-all",
};

const hero: CSSProperties = {
  background: "radial-gradient(120% 140% at 100% 0%, #1d4ed8 0%, #172554 45%, #0b1120 100%)",
  padding: "36px 20px 72px",
};

const heroInner: CSSProperties = { width: "100%", maxWidth: 480, margin: "0 auto" };

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  color: "#93c5fd",
  marginBottom: 10,
};

const heroTitle: CSSProperties = {
  fontSize: 27,
  lineHeight: 1.3,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "#fff",
  margin: 0,
};

const heroSub: CSSProperties = { fontSize: 14, lineHeight: 1.7, color: "#cbd5e1", margin: "12px 0 0" };

const statusBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  marginTop: 18,
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
};
const statusOpen: CSSProperties = {
  ...statusBase,
  background: "rgba(52,211,153,0.14)",
  border: "1px solid rgba(52,211,153,0.4)",
  color: "#a7f3d0",
};
const statusClosed: CSSProperties = {
  ...statusBase,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#e2e8f0",
};
const statusDot: CSSProperties = { width: 7, height: 7, borderRadius: 999 };

// 첫 카드가 헤더 위로 겹쳐 올라온다.
const body: CSSProperties = { width: "100%", maxWidth: 480, margin: "-44px auto 0", padding: "0 16px" };

const card: CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: 20,
  marginBottom: 14,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)",
};

const applyCard: CSSProperties = { border: `1.5px solid ${INK}` };

const cardTitle: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: INK,
  margin: "0 0 14px",
};

const infoRow: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12, padding: "15px 0" };

const iconWrap: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: "#eff4ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const infoLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 2 };
const infoValue: CSSProperties = { fontSize: 15.5, fontWeight: 700, color: INK, lineHeight: 1.5 };
const infoNote: CSSProperties = { fontSize: 13, color: MUTED, marginTop: 1 };

const contactLine: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "3px 0",
};

const chipLink: CSSProperties = {
  display: "inline-block",
  padding: "7px 11px",
  borderRadius: 999,
  background: "#eff4ff",
  color: ACCENT,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const programList: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const programItem: CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0" };
const programNo: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: ACCENT,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};
const programText: CSSProperties = { fontSize: 14.5, color: "#334155", lineHeight: 1.55 };

const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 };

const hint: CSSProperties = { fontSize: 13.5, color: MUTED, margin: "0 0 14px", lineHeight: 1.6 };

const input: CSSProperties = {
  width: "100%",
  minHeight: 54,
  padding: "0 16px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: INK,
  boxSizing: "border-box",
  marginBottom: 12,
};

function primaryButton(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: 54,
    borderRadius: 12,
    border: "none",
    background: disabled ? "#cbd5e1" : INK,
    color: "#fff",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const secondaryButton: CSSProperties = {
  width: "100%",
  minHeight: 52,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const identity: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#f8fafc",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: "14px",
  marginBottom: 14,
};

const avatar: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 999,
  background: INK,
  color: "#fff",
  fontSize: 17,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const doneBadge: CSSProperties = {
  flexShrink: 0,
  padding: "5px 10px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12.5,
  fontWeight: 800,
};

const box: CSSProperties = { borderRadius: 12, padding: "11px 13px", fontSize: 14, marginBottom: 12, lineHeight: 1.6 };
const errorBox: CSSProperties = { ...box, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" };
const okBox: CSSProperties = { ...box, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontWeight: 600 };
const infoBox: CSSProperties = { ...box, background: "#f1f5f9", border: `1px solid ${LINE}`, color: "#334155" };

const textButton: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: "8px 0",
  border: "none",
  background: "none",
  color: MUTED,
  fontFamily: FONT,
  fontSize: 13.5,
  textDecoration: "underline",
  cursor: "pointer",
};

const footer: CSSProperties = { textAlign: "center", fontSize: 12, color: "#94a3b8", margin: "20px 0 0" };
