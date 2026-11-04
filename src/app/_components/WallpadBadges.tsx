// 월패드 호환 화면(백오피스·공개 조회)이 같이 쓰는 판정·결과 표시.
import {
  WALLPAD_CASE_RESULT_LABEL,
  WALLPAD_VERDICT_LABEL,
  type WallpadCaseResult,
  type WallpadVerdict,
} from "@/lib/installation/wallpad/constants";
import type { CaseTally } from "@/lib/installation/wallpad/search";

const VERDICT_STYLE: Record<WallpadVerdict, string> = {
  COMPATIBLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  LIKELY: "bg-sky-50 text-sky-700 ring-sky-200",
  DIFFICULT: "bg-amber-50 text-amber-700 ring-amber-200",
  INCOMPATIBLE: "bg-red-50 text-red-700 ring-red-200",
  CAUTION_OLD: "bg-orange-50 text-orange-700 ring-orange-200",
  UNVERIFIED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const RESULT_STYLE: Record<WallpadCaseResult, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAIL: "bg-red-50 text-red-700 ring-red-200",
  SPECIAL: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function VerdictBadge({ verdict }: { verdict: WallpadVerdict }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${VERDICT_STYLE[verdict]}`}
    >
      {WALLPAD_VERDICT_LABEL[verdict]}
    </span>
  );
}

export function ResultBadge({ result }: { result: WallpadCaseResult }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${RESULT_STYLE[result] ?? ""}`}
    >
      {WALLPAD_CASE_RESULT_LABEL[result] ?? result}
    </span>
  );
}

export function TallyText({ tally }: { tally: CaseTally | undefined }) {
  if (!tally) return <span className="text-xs text-zinc-400">사례 없음</span>;
  const parts = [
    tally.success ? `성공 ${tally.success}` : null,
    tally.fail ? `실패 ${tally.fail}` : null,
    tally.special ? `특수 ${tally.special}` : null,
  ].filter(Boolean);
  return <span className="text-xs font-medium text-zinc-600">{parts.join(" · ")}</span>;
}
