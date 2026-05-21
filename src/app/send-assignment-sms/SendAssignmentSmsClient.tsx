"use client";

import { useEffect, useState } from "react";

type Result = {
  row: number;
  branch: string;
  to: string;
  ok: boolean;
  error?: string;
};

type Response = {
  total: number;
  sent: number;
  failed: number;
  results: Result[];
};

type TemplateInfo = {
  body: string;
  default: string;
  customized: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

const TEMPLATE_KEY = "assignment_completed";

const PLACEHOLDERS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "branchName", label: "기사 지점명 (등록부 기준)" },
  { key: "installerPhone", label: "기사 연락처 (등록부 기준)" },
  { key: "branch", label: "Excel 의 지점명 원본" },
  { key: "customerPhone", label: "고객 연락처 원본" },
];

const PREVIEW_VARS: Record<string, string> = {
  branchName: "강남/열쇠닥터",
  installerPhone: "010-1234-5678",
  branch: "강남/열쇠닥터",
  customerPhone: "010-9999-8888",
};

function renderPreview(body: string): string {
  return body.replace(/\{(\w+)\}/g, (m, name) =>
    name in PREVIEW_VARS ? PREVIEW_VARS[name] : m
  );
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export default function SendAssignmentSmsClient() {
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 템플릿 편집기 상태
  const [tplOpen, setTplOpen] = useState(false);
  const [tplInfo, setTplInfo] = useState<TemplateInfo | null>(null);
  const [tplDraft, setTplDraft] = useState<string>("");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMsg, setTplMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/sms-templates/${TEMPLATE_KEY}`);
        if (!res.ok) return;
        const data: TemplateInfo = await res.json();
        setTplInfo(data);
        setTplDraft(data.body);
      } catch {
        // ignore — fallback 默认值会在서버에서 적용
      }
    })();
  }, []);

  const tplChanged = tplInfo != null && tplDraft !== tplInfo.body;
  const tplBytes = byteLength(tplDraft);
  const tplPreview = renderPreview(tplDraft || tplInfo?.default || "");

  const saveTemplate = async () => {
    const trimmed = tplDraft.trim();
    if (!trimmed) {
      setTplMsg("본문이 비어 있습니다");
      return;
    }
    setTplSaving(true);
    setTplMsg(null);
    try {
      const res = await fetch(`/api/sms-templates/${TEMPLATE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTplMsg(data.error || `저장 실패 (${res.status})`);
      } else {
        setTplInfo(data);
        setTplDraft(data.body);
        setTplMsg("저장되었습니다");
      }
    } catch (e) {
      setTplMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTplSaving(false);
    }
  };

  const resetToDefault = () => {
    if (!tplInfo) return;
    if (!confirm("기본 템플릿으로 되돌립니다 (저장 후 적용). 계속하시겠습니까?")) return;
    setTplDraft(tplInfo.default);
    setTplMsg(null);
  };

  const handleSubmit = async () => {
    if (!file) return;
    const confirmed = confirm(
      `엑셀 파일의 모든 행에 SMS를 발송합니다.\n실제 SMS가 발송되며 비용이 발생합니다.\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);
    setResponse(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/send-assignment-sms", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `요청 실패 (${res.status})`);
      } else {
        setResponse(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f1ea_0%,#fbfaf8_55%,#ffffff_100%)] text-zinc-900">
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">설치 배정 SMS 발송</h1>
          <p className="text-sm text-zinc-500 mt-1">
            기사배정 페이지에서 다운로드한 Excel 을 업로드하여 고객에게 기사 연락처 SMS를 일괄 발송합니다.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-900">
          <p className="font-medium mb-1">엑셀 파일 형식</p>
          <ul className="list-disc ml-5 space-y-0.5 text-blue-800">
            <li>
              <a href="/dispatch" className="underline hover:text-blue-700">
                기사배정
              </a>{" "}
              페이지의 <strong>Excel 다운로드</strong> 결과 파일을 그대로 사용
            </li>
            <li>
              시트명: <code className="bg-blue-100 px-1 rounded">A S수리입력</code>
            </li>
            <li>
              읽는 컬럼: <code className="bg-blue-100 px-1 rounded">지점명</code> /{" "}
              <code className="bg-blue-100 px-1 rounded">연락처</code> (그 외 컬럼 무시)
            </li>
            <li>
              기사 연락처는 서버의 INSTALLERS 등록부에서 <code className="bg-blue-100 px-1 rounded">지점명</code>{" "}
              기준으로 자동 조회 (엑셀에 별도 입력 불필요)
            </li>
          </ul>
          <p className="font-medium mt-3">
            발송 문구는 아래 <strong>「발송 문구 설정」</strong>에서 수정할 수 있습니다.
          </p>
        </div>

        {/* 발송 문구 설정 (편집기) */}
        <details
          open={tplOpen}
          onToggle={(e) => setTplOpen((e.target as HTMLDetailsElement).open)}
          className="bg-white border border-black/10 rounded-xl mb-6 overflow-hidden"
        >
          <summary className="px-6 py-4 cursor-pointer select-none flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-zinc-900">발송 문구 설정</span>
              {tplInfo && (
                <span className="ml-3 text-xs text-zinc-500">
                  {tplInfo.customized
                    ? `사용자 지정 (${tplInfo.updatedBy ?? "-"}, ${
                        tplInfo.updatedAt
                          ? new Date(tplInfo.updatedAt).toLocaleString("ko-KR")
                          : ""
                      })`
                    : "기본 템플릿 사용 중"}
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-400">{tplOpen ? "▲" : "▼"}</span>
          </summary>

          <div className="px-6 pb-6 border-t border-zinc-100 pt-4 space-y-4">
            {!tplInfo ? (
              <p className="text-sm text-zinc-400">불러오는 중…</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    템플릿 본문
                  </label>
                  <textarea
                    value={tplDraft}
                    onChange={(e) => {
                      setTplDraft(e.target.value);
                      setTplMsg(null);
                    }}
                    rows={6}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="아카라라이프 설치 배정 완료&#10;{branchName} {installerPhone}&#10;기사님 연락처 입니다"
                  />
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-zinc-500">
                      길이: {tplDraft.length}자 / {tplBytes} bytes
                      {tplBytes > 90 && (
                        <span className="ml-2 text-orange-600">
                          ⚠ 90 bytes 초과 — LMS 요금 (단가 3배) 으로 청구됩니다
                        </span>
                      )}
                    </span>
                    {tplChanged && (
                      <span className="text-blue-600">변경됨 (저장되지 않음)</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-600 mb-1">사용 가능한 변수</p>
                  <div className="flex flex-wrap gap-2">
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setTplDraft((prev) => prev + `{${p.key}}`);
                          setTplMsg(null);
                        }}
                        className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded font-mono"
                        title={p.label}
                      >
                        {`{${p.key}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-600 mb-1">미리보기 (샘플 데이터)</p>
                  <pre className="bg-zinc-50 border border-zinc-200 rounded p-3 text-xs text-zinc-700 whitespace-pre-wrap min-h-[60px]">
                    {tplPreview}
                  </pre>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={!tplChanged || tplSaving}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tplSaving ? "저장 중…" : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={resetToDefault}
                    className="px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    기본값으로 초기화
                  </button>
                  {tplMsg && (
                    <span
                      className={`text-xs ${
                        tplMsg.includes("저장되었습니다")
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {tplMsg}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </details>

        <div className="bg-white border border-black/10 rounded-xl p-6 mb-6">
          <label className="block text-sm font-medium text-zinc-700 mb-2">엑셀 파일</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResponse(null);
              setError(null);
            }}
            className="block w-full text-sm text-zinc-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {file && (
            <p className="mt-2 text-xs text-zinc-500">
              선택됨: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!file || sending}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "발송 중..." : "SMS 일괄 발송"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-800">
            {error}
          </div>
        )}

        {response && (
          <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex gap-6 text-sm">
              <div>
                <span className="text-zinc-500">전체</span>{" "}
                <span className="font-semibold text-zinc-900">{response.total}</span>
              </div>
              <div>
                <span className="text-zinc-500">성공</span>{" "}
                <span className="font-semibold text-green-700">{response.sent}</span>
              </div>
              <div>
                <span className="text-zinc-500">실패</span>{" "}
                <span className="font-semibold text-red-700">{response.failed}</span>
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">행</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">지점명</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">
                    수신번호
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-500">결과</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">에러</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((r, idx) => (
                  <tr key={idx} className="border-b border-zinc-50 text-sm">
                    <td className="px-4 py-2 text-zinc-600">{r.row}</td>
                    <td className="px-4 py-2 text-zinc-900">{r.branch || "-"}</td>
                    <td className="px-4 py-2 text-zinc-700 font-mono">{r.to || "-"}</td>
                    <td className="px-4 py-2 text-center">
                      {r.ok ? (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          성공
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                          실패
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600">{r.error || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
