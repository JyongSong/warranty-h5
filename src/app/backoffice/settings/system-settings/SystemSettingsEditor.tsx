"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import type { SystemSettingListItem } from "@/lib/backoffice/system-settings";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { updateSystemSettingAction } from "./actions";

const errorMessage: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "관리자 권한이 필요합니다.",
  SETTING_KEY_REQUIRED: "설정 키가 없습니다.",
  SETTING_KEY_NOT_EDITABLE: "수정할 수 없는 설정입니다.",
  SETTING_VALUE_INVALID: "허용되지 않는 설정 값입니다.",
  SETTING_UPDATE_FAILED: "설정 저장에 실패했습니다.",
};

export default function SystemSettingsEditor({
  settings,
}: {
  settings: SystemSettingListItem[];
}) {
  const router = useRouter();
  const [editingSetting, setEditingSetting] = useState<SystemSettingListItem | null>(null);
  const [nextValue, setNextValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openEditor(setting: SystemSettingListItem) {
    setEditingSetting(setting);
    setNextValue(setting.value);
    setError(null);
  }

  function closeEditor() {
    if (isPending) return;
    setEditingSetting(null);
    setNextValue("");
    setError(null);
  }

  function saveSetting() {
    if (!editingSetting) return;

    const formData = new FormData();
    formData.set("key", editingSetting.key);
    formData.set("value", nextValue);

    startTransition(async () => {
      const result = await updateSystemSettingAction(formData);
      if (!result.ok) {
        setError(errorMessage[result.error] ?? result.error);
        return;
      }

      setEditingSetting(null);
      setNextValue("");
      setError(null);
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSetting();
  }

  if (settings.length === 0) {
    return <p className="px-5 py-8 text-sm text-zinc-600">표시할 시스템 설정이 없습니다.</p>;
  }

  return (
    <>
      <div className="overflow-auto">
        <table className="w-max min-w-full border-collapse text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
            <tr>
              <th className="w-[40%] border-b border-zinc-200 px-4 py-3">키</th>
              <th className="w-[20%] border-b border-zinc-200 px-4 py-3">현재값</th>
              <th className="border-b border-zinc-200 px-4 py-3">설명</th>
              <th className="w-24 border-b border-zinc-200 px-4 py-3">작업</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((setting) => (
              <tr key={setting.key} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="align-top px-4 py-3 font-mono text-xs leading-5 text-zinc-700">
                  {setting.key}
                </td>
                <td className="align-top px-4 py-3 font-mono text-xs leading-5 text-zinc-950">
                  {setting.effectiveValue}
                </td>
                <td className="align-top px-4 py-3 text-sm leading-5 text-zinc-700">
                  {setting.description}
                </td>
                <td className="align-top px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openEditor(setting)}
                    className={getBackofficeButtonClass("primary")}
                  >
                    편집
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingSetting ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="system-setting-dialog-title"
            className="w-full max-w-lg rounded-md bg-white shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeEditor();
            }}
          >
            <form onSubmit={handleSubmit}>
              <div className="border-b border-zinc-200 px-5 py-4">
                <h3 id="system-setting-dialog-title" className="text-lg font-semibold text-zinc-950">
                  시스템 설정 편집
                </h3>
                <p className="mt-1 font-mono text-xs break-all text-zinc-500">{editingSetting.key}</p>
              </div>

              <div className="grid gap-4 px-5 py-5">
                <div>
                  <div className="text-sm font-medium text-zinc-700">설명</div>
                  <p className="mt-1 text-sm leading-5 text-zinc-600">{editingSetting.description}</p>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-zinc-700">값</span>
                  <input
                    value={nextValue}
                    onChange={(event) => setNextValue(event.target.value)}
                    placeholder={editingSetting.validationHint}
                    className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-950 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                    autoFocus
                  />
                  <span className="text-xs leading-5 text-zinc-500">{editingSetting.validationHint}</span>
                </label>

                {error ? (
                  <div className="rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={isPending}
                  className={getBackofficeButtonClass("secondary", "lg")}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className={getBackofficeButtonClass("primary", "lg")}
                >
                  {isPending ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
