"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { formatKrPhone, normalizePhone } from "@/lib/phone";
import * as ui from "@/app/installer/ui";
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
  INSTALLER_NOT_FOUND: "등록된 기사 번호가 아닙니다. 문자를 받으신 번호로 입력해 주세요.",
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

  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(seminar.venue.replace(/\s*\d+호$/, ""))}`;

  return (
    <main style={{ ...ui.page, paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }}>
      <div style={ui.panel}>
        <div style={{ marginBottom: 16 }}>
          <span style={open ? ui.badge("#dcfce7", "#166534") : ui.badge("#e4e4e7", "#52525b")}>
            {open ? "접수 중" : "접수 마감"}
          </span>
          <h1 style={{ ...ui.h1, margin: "10px 0 6px" }}>{seminar.title}</h1>
          {seminar.description ? <p style={sub}>{seminar.description}</p> : null}
        </div>

        <div style={ui.card}>
          <InfoRow label="일시" value={seminar.scheduleText} />
          <InfoRow
            label="장소"
            value={seminar.venue}
            note={seminar.venueNote}
            extra={
              <a href={mapUrl} target="_blank" rel="noreferrer" style={link}>
                지도 보기
              </a>
            }
          />
          {seminar.attendanceNote ? <InfoRow label="참석" value={seminar.attendanceNote} /> : null}
          {seminar.parkingInfo ? <InfoRow label="주차 안내" value={seminar.parkingInfo} /> : null}
          {seminar.contactPhone ? (
            <InfoRow
              label="문의 전화"
              value={
                <a href={`tel:${normalizePhone(seminar.contactPhone)}`} style={link}>
                  {[seminar.contactName, formatKrPhone(seminar.contactPhone)].filter(Boolean).join(" ")}
                </a>
              }
              last
            />
          ) : null}
        </div>

        {seminar.programItems.length > 0 ? (
          <div style={ui.card}>
            <div style={cardTitle}>주요 프로그램</div>
            <ul style={list}>
              {seminar.programItems.map((item) => (
                <li key={item} style={{ marginBottom: 6 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={ui.card}>
          <div style={cardTitle}>{open ? "참석 신청" : "신청 내역 확인"}</div>

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
                style={{ ...ui.input, marginBottom: 8 }}
              />
              <p style={hint}>안내 문자를 받으신 번호를 입력해 주세요.</p>
              {error ? <div style={errorBox}>{error}</div> : null}
              <button
                type="button"
                onClick={onLookup}
                disabled={busy || !phoneReady}
                style={ui.primaryButton(busy || !phoneReady)}
              >
                {busy ? "확인 중…" : "확인"}
              </button>
            </>
          ) : (
            <>
              <div style={identity}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: ui.TEXT }}>
                    {lookup.maskedName} 기사님
                  </div>
                  <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>
                    {[lookup.region, formatKrPhone(normalized)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {lookup.registered ? <span style={ui.badge("#dcfce7", "#166534")}>신청 완료</span> : null}
              </div>

              {error ? <div style={errorBox}>{error}</div> : null}

              {lookup.registered ? (
                lookup.canCancel ? (
                  <button type="button" onClick={onCancel} disabled={busy} style={ui.secondaryButton}>
                    {busy ? "처리 중…" : "참석 취소"}
                  </button>
                ) : (
                  <p style={hint}>취소 가능 시간이 지났습니다. 변경은 문의 전화로 연락해 주세요.</p>
                )
              ) : lookup.state === "OPEN" ? (
                <button type="button" onClick={onRegister} disabled={busy} style={ui.primaryButton(busy)}>
                  {busy ? "신청 중…" : "참석 신청"}
                </button>
              ) : error ? null : (
                <div style={infoBox}>접수가 마감되었습니다.</div>
              )}

              <button type="button" onClick={reset} disabled={busy} style={textButton}>
                번호 다시 입력
              </button>
            </>
          )}
        </div>

        <p style={footer}>아카라라이프 도어락사업팀</p>
      </div>
    </main>
  );
}

function InfoRow({
  label: rowLabel,
  value,
  note,
  extra,
  last = false,
}: {
  label: string;
  value: ReactNode;
  note?: string | null;
  extra?: ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: last ? 0 : 12 }}>
      <div style={{ ...ui.rowLabel, width: 60, flexShrink: 0, paddingTop: 2 }}>{rowLabel}</div>
      <div style={{ ...ui.rowValue, minWidth: 0, flex: 1 }}>
        {value}
        {note ? <div style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>{note}</div> : null}
        {extra ? <div style={{ marginTop: 2 }}>{extra}</div> : null}
      </div>
    </div>
  );
}

const sub: CSSProperties = { fontSize: 14, color: "#52525b", lineHeight: 1.7, margin: 0 };

const cardTitle: CSSProperties = { fontSize: 15, fontWeight: 800, color: "#18181b", marginBottom: 12 };

const list: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 14,
  color: "#3f3f46",
  lineHeight: 1.6,
};

const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 800,
  color: "#3f3f46",
  marginBottom: 8,
};

const hint: CSSProperties = { fontSize: 13, color: "#71717a", margin: "0 0 12px", lineHeight: 1.6 };

const link: CSSProperties = { color: "#1d4ed8", fontSize: 14, fontWeight: 600, textDecoration: "underline" };

const identity: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "12px 14px",
  marginBottom: 12,
};

const box: CSSProperties = { borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 12, lineHeight: 1.6 };
const errorBox: CSSProperties = { ...box, background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b" };
const okBox: CSSProperties = { ...box, background: "#f0fdf4", border: "1px solid #86efac", color: "#166534" };
const infoBox: CSSProperties = { ...box, background: "#f4f4f5", border: "1px solid #e4e4e7", color: "#3f3f46" };

const textButton: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: "8px 0",
  border: "none",
  background: "none",
  color: "#71717a",
  fontSize: 14,
  textDecoration: "underline",
  cursor: "pointer",
};

const footer: CSSProperties = { textAlign: "center", fontSize: 12, color: "#a1a1aa", margin: "16px 0 0" };
