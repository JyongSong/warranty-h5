"use client";

import { useState, type CSSProperties } from "react";
import {
  INSTALL_DATE_MAX_DAYS_AHEAD,
  INSTALL_DATE_MIN_DAYS_AHEAD,
} from "@/lib/installation/customer/timing";

// 자사(/i/c)와 CJ(/i/cj) 고객 입력 화면이 같은 설치 희망일 규칙과 문구를 쓰도록
// 달력을 한곳에 둔다. 서버 검증(normalizeCustomerRequestSubmitInput)과 짝이다.
// 색만 화면마다 다르게 받는다.

export const INSTALL_DATE_RANGE_NOTICE = `오늘 기준 ${INSTALL_DATE_MIN_DAYS_AHEAD}일 뒤부터 ${INSTALL_DATE_MAX_DAYS_AHEAD}일 뒤까지 선택할 수 있습니다. (일요일 제외)`;
export const INSTALL_DATE_SUNDAY_NOTICE =
  "일요일 설치를 원하시면 해피콜 시 기사님과 협의하시거나 고객센터로 문의해 주세요.";
export const INSTALL_SCHEDULE_ADJUST_NOTICE = "설치 날짜와 시간은 기사님 일정에 따라 조정될 수 있습니다.";

const BORDER = "#E5E7EB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const DISABLED = "#D1D5DB";

export function getInstallDateBounds(today: string) {
  const base = new Date(`${today}T00:00:00Z`);
  return {
    min: shiftYmd(base, INSTALL_DATE_MIN_DAYS_AHEAD),
    max: shiftYmd(base, INSTALL_DATE_MAX_DAYS_AHEAD),
  };
}

export function InstallDateCalendar({
  value,
  minDate,
  maxDate,
  onSelect,
  accentColor,
}: {
  value: string;
  minDate: string;
  maxDate: string;
  onSelect: (date: string) => void;
  accentColor: string;
}) {
  const [cursor, setCursor] = useState(() => value || minDate);
  const cursorDate = new Date(`${cursor}T00:00:00Z`);
  const year = cursorDate.getUTCFullYear();
  const month = cursorDate.getUTCMonth();

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => toYmd(year, month, index + 1)),
  ];

  const canGoPrev = toYmd(year, month, 1) > minDate;
  const canGoNext = toYmd(year, month + 1, 1) <= maxDate;

  return (
    <div style={calendarStyle}>
      <div style={calendarHeadStyle}>
        <button
          type="button"
          style={calendarNavStyle(!canGoPrev)}
          disabled={!canGoPrev}
          onClick={() => setCursor(toYmd(year, month - 1, 1))}
          aria-label="이전 달"
        >
          ‹
        </button>
        <span style={calendarTitleStyle}>
          {year}년 {month + 1}월
        </span>
        <button
          type="button"
          style={calendarNavStyle(!canGoNext)}
          disabled={!canGoNext}
          onClick={() => setCursor(toYmd(year, month + 1, 1))}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div style={calendarGridStyle}>
        {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
          <span key={label} style={calendarWeekdayStyle}>
            {label}
          </span>
        ))}
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />;

          // 앞쪽 빈 칸까지 포함한 인덱스라 7로 나눈 나머지가 곧 요일이다.
          const weekday = index % 7;
          const disabled = date < minDate || date > maxDate || weekday === 0;
          const selected = date === value;

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              style={calendarDayStyle(disabled, selected, accentColor)}
            >
              {Number(date.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shiftYmd(base: Date, days: number) {
  const next = new Date(base.getTime() + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

function toYmd(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

const calendarStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 16,
};

const calendarHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const calendarTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 700 };

function calendarNavStyle(disabled: boolean): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "none",
    color: disabled ? DISABLED : TEXT,
    fontSize: 20,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const calendarGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 2,
  textAlign: "center",
};

const calendarWeekdayStyle: CSSProperties = {
  padding: "8px 0",
  fontSize: 11,
  fontWeight: 600,
  color: MUTED,
};

function calendarDayStyle(disabled: boolean, selected: boolean, accentColor: string): CSSProperties {
  return {
    height: 40,
    border: "none",
    borderRadius: 8,
    background: selected ? accentColor : "transparent",
    color: selected ? "#FFFFFF" : disabled ? DISABLED : TEXT,
    fontSize: 13,
    fontWeight: selected ? 700 : 500,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
