"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCjManifestAction,
  partnerLogoutAction,
  searchCjManifestAction,
  uploadCjManifestAction,
} from "../actions";
import type { ManifestEntryView } from "../actions";

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
  recentEntries: ManifestEntryView[];
  recentTruncated: boolean;
};

export default function CjUploadClient({ partnerName, stats, uploads, recentEntries, recentTruncated }: Props) {
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

          <div style={sampleBoxStyle}>
            <div>
              <p style={sampleTitleStyle}>처음이시라면 샘플 파일을 받아 보세요</p>
              <p style={sampleHintStyle}>
                엑셀에서 열어도 주문번호가 깨지지 않는 형식입니다. 내용만 바꿔 저장한 뒤 그대로
                올리시면 됩니다.
              </p>
            </div>
            <button type="button" onClick={downloadSampleCsv} style={sampleButtonStyle}>
              샘플 받기
            </button>
          </div>

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

        <ManifestSearch initialEntries={recentEntries} initialTruncated={recentTruncated} />

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

// 올린 주문번호를 찾아 보고, 잘못 올린 번호는 지운다. 고객이 이미 접수한 번호는
// 설치 건과 이어져 있어 지울 수 없다(서버에서도 막는다).
function ManifestSearch({
  initialEntries,
  initialTruncated,
}: {
  initialEntries: ManifestEntryView[];
  initialTruncated: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [entries, setEntries] = useState<ManifestEntryView[]>(initialEntries);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function runSearch(nextQuery: string) {
    setLoading(true);
    const response = await searchCjManifestAction(nextQuery);
    setLoading(false);

    if (!response.ok) {
      setMessage({ ok: false, text: response.message });
      return;
    }
    setSearchedQuery(nextQuery.trim());
    setEntries(response.entries);
    setTruncated(response.truncated);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    void runSearch(query);
  }

  async function handleDelete(entry: ManifestEntryView) {
    if (!window.confirm(`주문번호 ${entry.orderNo} 을(를) 명단에서 삭제할까요?\n삭제하면 고객이 이 번호로 접수할 수 없습니다.`)) {
      return;
    }

    setDeletingId(entry.id);
    setMessage(null);
    const response = await deleteCjManifestAction(entry.id);
    setDeletingId(null);

    if (!response.ok) {
      setMessage({ ok: false, text: response.message });
      // 그사이 접수됐을 수 있으니 상태를 다시 받아온다.
      void runSearch(searchedQuery);
      return;
    }

    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setMessage({ ok: true, text: `${entry.orderNo} 을(를) 삭제했습니다.` });
    // 위쪽 통계 숫자를 갱신한다.
    router.refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={cardTitleStyle}>주문번호 조회</h2>
      <p style={cardHintStyle}>
        주문번호 일부만 입력해도 찾을 수 있습니다. 비워 두고 조회하면 최근 등록한 20건을
        보여 줍니다. 고객이 아직 접수하지 않은 번호만 삭제할 수 있습니다.
      </p>

      <form onSubmit={handleSubmit} style={searchRowStyle}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="주문번호"
          inputMode="numeric"
          style={searchInputStyle}
        />
        <button type="submit" disabled={loading} style={searchButtonStyle(loading)}>
          {loading ? "조회 중..." : "조회"}
        </button>
      </form>

      {message ? <p style={message.ok ? successStyle : errorStyle}>{message.text}</p> : null}

      {entries.length === 0 ? (
        <p style={emptyStyle}>
          {searchedQuery ? `'${searchedQuery}' 에 해당하는 주문번호가 없습니다.` : "아직 등록된 주문번호가 없습니다."}
        </p>
      ) : (
        <>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>주문번호</th>
                  <th style={thStyle}>주문일</th>
                  <th style={thStyle}>등록일시</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle} aria-label="삭제" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{entry.orderNo}</td>
                    <td style={tdStyle}>{formatOrderDate(entry.orderDate)}</td>
                    <td style={tdStyle}>{formatDateTime(entry.createdAt)}</td>
                    <td style={tdStyle}>
                      {entry.consumedAt ? (
                        <span style={consumedBadgeStyle}>접수 완료 · {formatDateTime(entry.consumedAt)}</span>
                      ) : (
                        <span style={pendingBadgeStyle}>미접수</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {entry.consumedAt ? null : (
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry)}
                          disabled={deletingId !== null}
                          style={deleteButtonStyle(deletingId !== null)}
                        >
                          {deletingId === entry.id ? "삭제 중..." : "삭제"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated ? (
            <p style={emptyStyle}>결과가 많아 일부만 보여 줍니다. 주문번호를 더 길게 입력해 주세요.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function formatOrderDate(value: string | null) {
  if (!value) return "-";
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value;
}

// 샘플 파일. 엑셀에서 열어도 주문번호가 망가지지 않도록 ="..." 로 감싸고,
// 한글 헤더가 깨지지 않도록 BOM 을 붙인다(엑셀은 BOM 없는 UTF-8 을 깨뜨린다).
function downloadSampleCsv() {
  const rows = [
    ["주문번호", "주문일"],
    ['="20260620034905"', '="20260620"'],
    ['="20260620034906"', '="20260621"'],
    ['="20260621034907"', '="20260621"'],
  ];
  const csv = rows.map((row) => row.join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "cj-order-sample.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

const sampleBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "14px 16px",
  borderRadius: 10,
  background: "#F5F3FF",
};

const sampleTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "#5B21B6",
};

const sampleHintStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#6D28D9",
  lineHeight: 1.6,
};

const sampleButtonStyle: CSSProperties = {
  flexShrink: 0,
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: PURPLE,
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

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

const searchRowStyle: CSSProperties = { display: "flex", gap: 8 };

const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "11px 12px",
  borderRadius: 9,
  border: `1px solid ${BORDER}`,
  fontSize: 14,
};

function searchButtonStyle(disabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "11px 18px",
    borderRadius: 9,
    border: "none",
    background: disabled ? "#E5E7EB" : PURPLE,
    color: disabled ? "#9CA3AF" : "#FFFFFF",
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const badgeBaseStyle: CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 600,
};

const consumedBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#ECFDF5", color: "#047857" };

const pendingBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#F3F4F6", color: MUTED };

function deleteButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 7,
    border: "1px solid #FECACA",
    background: "#FFFFFF",
    color: disabled ? "#FCA5A5" : "#DC2626",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
