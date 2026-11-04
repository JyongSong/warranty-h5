"use client";

import {
  ASSIGNABLE_BACKOFFICE_LEVELS,
  formatBackofficeLevel,
} from "@/lib/login/backofficeRoles";

const LEVEL_DESCRIPTION: Record<number, string> = {
  1: "모든 권한 (설정·유저 관리 포함)",
  2: "설정을 제외한 모든 화면 조회·수정",
  3: "설정을 제외한 모든 화면 조회만 (수정·문자 발송 불가)",
};

export function BackofficeLevelSelect({
  value,
  onChange,
  defaultValue,
}: {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">등급</span>
      <select
        name="level"
        required
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      >
        <option value="" disabled>
          등급 선택
        </option>
        {ASSIGNABLE_BACKOFFICE_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}. {formatBackofficeLevel(level)} — {LEVEL_DESCRIPTION[level]}
          </option>
        ))}
      </select>
    </label>
  );
}
