"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { partnerLogoutAction, uploadCjManifestAction } from "../actions";

type Upload = {
  id: string;
  fileName: string;
  totalRows: number;
  insertedCount: number;
  duplicateCount: number;
  invalidCount: number;
  uploadedBy: string | null;
  createdAt: string;
};

type Props = {
  partnerName: string;
  stats: { total: number; consumed: number; pending: number };
  uploads: Upload[];
};

export default function CjUploadClient({ partnerName, stats, uploads }: Props) {
  const [fileName, setFileName] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; totalRows: number; insertedCount: number; duplicateCount: number; invalidCount: number }
    | { ok: false; message: string }
    | null
  >(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setResult(null);

    const response = await uploadCjManifestAction(formData);
    setPending(false);
    setResult(response);

    if (response.ok) {
      // 목록과 통계를 서버에서 다시 받아온다.
      setTimeout(() => window.location.reload(), 1200);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>PARTNER</p>
            <h1 style={titleStyle}>주문번호 명단 업로드</h1>
          </div>
          <form action={partnerLogoutAction}>
            <button type="submit" style={logoutStyle}>
              로그아웃
            </button>
          </form>
        </header>
        <p style={subtitleStyle}>{partnerName}님, 안녕하세요.</p>

        <div style={statsRowStyle}>
          <Stat label="등록된 주문번호" value={stats.total} />
          <Stat label="접수 완료" value={stats.consumed} />
          <Stat label="미접수" value={stats.pending} />
        </div>

        <form action={handleSubmit} style={cardStyle}>
          <h2 style={cardTitleStyle}>파일 업로드</h2>
          <p style={cardHintStyle}>
            CSV 또는 TSV 파일의 <strong>첫 번째 열</strong>을 주문번호로 읽습니다. 두 번째 열이
            날짜(YYYYMMDD 또는 YYYY-MM-DD)이면 주문일로 함께 저장합니다. 나머지 열은 무시하므로
            기존 리포트를 그대로 올리셔도 됩니다.
          </p>

          <label style={fileLabelStyle}>
            <input
              type="file"
              name="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              required
              style={{ display: "none" }}
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
            <span style={fileButtonStyle}>파일 선택</span>
            <span style={fileNameStyle}>{fileName || "선택된 파일 없음"}</span>
          </label>

          <button type="submit" disabled={pending || !fileName} style={submitStyle(pending || !fileName)}>
            {pending ? "업로드 중..." : "업로드"}
          </button>

          {result?.ok === false ? <p style={errorStyle}>{result.message}</p> : null}
          {result?.ok === true ? (
            <p style={successStyle}>
              {result.insertedCount.toLocaleString()}건이 등록되었습니다. (읽은 행{" "}
              {result.totalRows.toLocaleString()} · 이미 등록됨 {result.duplicateCount.toLocaleString()} ·
              형식 오류 {result.invalidCount.toLocaleString()})
            </p>
          ) : null}
        </form>

        <section style={cardStyle}>
          <h2 style={cardTitleStyle}>최근 업로드 이력</h2>
          {uploads.length === 0 ? (
            <p style={emptyStyle}>아직 업로드한 파일이 없습니다.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>일시</th>
                    <th style={thStyle}>파일명</th>
                    <th style={thNumStyle}>등록</th>
                    <th style={thNumStyle}>중복</th>
                    <th style={thNumStyle}>오류</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.id}>
                      <td style={tdStyle}>{formatDateTime(upload.createdAt)}</td>
                      <td style={tdStyle}>{upload.fileName}</td>
                      <td style={tdNumStyle}>{upload.insertedCount.toLocaleString()}</td>
                      <td style={tdNumStyle}>{upload.duplicateCount.toLocaleString()}</td>
                      <td style={tdNumStyle}>{upload.invalidCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyle}>
      <p style={statLabelStyle}>{label}</p>
      <p style={statValueStyle}>{value.toLocaleString()}</p>
    </div>
  );
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

const PURPLE = "#7C3AED";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#F9FAFB",
  padding: "28px 16px 64px",
  fontFamily:
    "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  color: "#111827",
};

const containerStyle: CSSProperties = { maxWidth: 720, margin: "0 auto" };

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: PURPLE,
};

const titleStyle: CSSProperties = { margin: "6px 0 0", fontSize: 24, fontWeight: 700 };

const subtitleStyle: CSSProperties = { margin: "10px 0 22px", fontSize: 13, color: MUTED };

const logoutStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: "#FFFFFF",
  color: MUTED,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const statsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  marginBottom: 20,
};

const statStyle: CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: "14px 16px",
};

const statLabelStyle: CSSProperties = { margin: 0, fontSize: 12, color: MUTED };

const statValueStyle: CSSProperties = { margin: "6px 0 0", fontSize: 20, fontWeight: 700 };

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  padding: 20,
  marginBottom: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardTitleStyle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };

const cardHintStyle: CSSProperties = { margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.7 };

const fileLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  cursor: "pointer",
};

const fileButtonStyle: CSSProperties = {
  flexShrink: 0,
  padding: "10px 16px",
  borderRadius: 9,
  border: `1px solid ${PURPLE}`,
  color: PURPLE,
  fontSize: 13,
  fontWeight: 600,
};

const fileNameStyle: CSSProperties = {
  fontSize: 13,
  color: MUTED,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function submitStyle(disabled: boolean): CSSProperties {
  return {
    padding: "13px 18px",
    borderRadius: 10,
    border: "none",
    background: disabled ? "#E5E7EB" : PURPLE,
    color: disabled ? "#9CA3AF" : "#FFFFFF",
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const errorStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#FEF2F2",
  color: "#DC2626",
  fontSize: 13,
  lineHeight: 1.6,
};

const successStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#ECFDF5",
  color: "#047857",
  fontSize: 13,
  lineHeight: 1.6,
};

const emptyStyle: CSSProperties = { margin: 0, fontSize: 13, color: MUTED };

const tableWrapStyle: CSSProperties = { overflowX: "auto" };

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: `1px solid ${BORDER}`,
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
};

const thNumStyle: CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: CSSProperties = {
  padding: "10px",
  borderBottom: `1px solid #F3F4F6`,
};

const tdNumStyle: CSSProperties = { ...tdStyle, textAlign: "right" };
