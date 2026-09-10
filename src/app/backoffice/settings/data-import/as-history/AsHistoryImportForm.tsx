"use client";

import { useActionState } from "react";
import { LoadingButton } from "@/app/_components/LoadingIndicator";
import { getBackofficeButtonClass } from "../../../backoffice-button-styles";
import { importAsHistoryAction } from "./actions";
import { initialAsHistoryImportState, type AsHistoryImportState } from "./state";

const errorMessage: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "관리자 권한이 필요합니다.",
  FILE_REQUIRED: "엑셀 파일을 선택해 주세요.",
  EXCEL_REQUIRED: "ECOUNT 에서 내려받은 .xlsx 파일을 올려 주세요.",
  NO_ROWS: "읽을 수 있는 행이 없습니다. 헤더에 '고객명'과 '거래처명'이 있는지 확인해 주세요.",
  IMPORT_FAILED: "가져오기에 실패했습니다. 파일 내용을 확인해 주세요.",
};

export default function AsHistoryImportForm({ storedCount }: { storedCount: number }) {
  const [state, formAction, pending] = useActionState(importAsHistoryAction, initialAsHistoryImportState);

  return (
    <div className="max-w-3xl grid gap-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-zinc-950">ERP 설치 이력 가져오기</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          ECOUNT &gt; A/S수리조회 를 엑셀로 내려받아 그대로 올리면 됩니다. A/S 접수 때
          &quot;누가 깔았나&quot;를 찾는 데만 씁니다. 전표번호 기준으로 덮어쓰므로 같은 파일을
          여러 번 올려도 안전하고, ERP 에서 담당기사를 나중에 채워 넣은 뒤 다시 올리면 그대로
          반영됩니다.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          현재 저장된 이력 <span className="font-semibold text-zinc-900">{storedCount.toLocaleString()}건</span>
        </p>

        <form action={formAction} className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-600">엑셀 파일 (.xlsx)</span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls"
              className="block w-full cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-700"
            />
          </label>

          <div>
            <LoadingButton
              type="submit"
              loading={pending}
              loadingLabel="가져오는 중"
              className={getBackofficeButtonClass("primary", "lg")}
            >
              가져오기
            </LoadingButton>
          </div>
        </form>

        {state.error ? (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage[state.error] ?? state.error}
          </p>
        ) : null}

        {state.ok ? <ImportSummary state={state} /> : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h3 className="text-base font-semibold text-zinc-950">이 데이터로 할 수 있는 것과 없는 것</h3>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-700">
          <li>
            <span className="font-semibold">시공 업체</span>는 거의 모든 건에서 확인됩니다. A/S 접수
            화면에서 원 시공 이력 카드로 보여 주고, 담당자가 보고 기사를 지정합니다.
          </li>
          <li>
            <span className="font-semibold">담당 기사</span>는 ERP 원장에 채워진 건만 확정됩니다.
            비어 있거나 한 건에 두 명이 적힌 건은 업체까지만 표시합니다.
          </li>
          <li>
            <span className="font-semibold">050X 안심번호</span>로 접수된 건은 전화번호로 찾을 수
            없습니다(만료되는 임시 번호). 이 건들은 주소·고객명으로만 조회됩니다.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ImportSummary({ state }: { state: AsHistoryImportState }) {
  const matchedTotal = state.matchedInstaller + state.matchedVendor;
  const rate = state.saved > 0 ? ((matchedTotal / state.saved) * 100).toFixed(1) : "0.0";

  return (
    <div className="mt-4 grid gap-3 rounded-md bg-zinc-50 px-4 py-4">
      <p className="text-sm font-semibold text-zinc-950">
        {state.fileName} · 읽은 행 {state.total.toLocaleString()}건 → 저장 {state.saved.toLocaleString()}건
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label="신규" value={state.inserted} />
        <Stat label="갱신" value={state.updated} />
        <Stat label="전표번호 없어 제외" value={state.skipped} />
        <Stat label="기사까지 확정" value={state.matchedInstaller} />
        <Stat label="업체까지 확정" value={state.matchedVendor} />
        <Stat label="미매칭" value={state.unmatched} tone={state.unmatched > 0 ? "warn" : undefined} />
      </dl>
      <p className="text-sm text-zinc-600">
        업체 이상 확보 <span className="font-semibold text-zinc-900">{rate}%</span> · 안심번호(전화
        조회 불가) {state.safeNumber.toLocaleString()}건
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`font-semibold ${tone === "warn" ? "text-amber-700" : "text-zinc-900"}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
