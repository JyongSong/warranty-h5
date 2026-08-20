import type { CSSProperties } from "react";
import { formatKrPhone } from "@/lib/phone";
import * as ui from "./ui";

// 연락처 행 + 통화 버튼. 해피콜은 기사가 상세 화면에서 바로 거는 동작이라
// 번호를 눌러 옮겨 적는 단계를 없앤다.
export default function PhoneRow({ label, phone }: { label: string; phone: string }) {
  // tel: 은 구분자를 허용하지만, 일부 단말이 하이픈에서 끊기므로 숫자만 넘긴다.
  const dialable = phone.replace(/[^\d+]/g, "");

  return (
    <div style={row}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={ui.rowValue}>{formatKrPhone(phone)}</div>
      <a href={`tel:${dialable}`} style={callButton} aria-label={`${label}로 전화 걸기`}>
        <span aria-hidden>📞</span> 통화
      </a>
    </div>
  );
}

const row: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "80px 1fr auto",
  alignItems: "center",
  gap: 8,
  padding: "5px 0",
};

const callButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  // 터치 타깃을 44px 이상으로 확보한다.
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  background: "#111",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
