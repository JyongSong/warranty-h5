"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PARTNER_INSTALL_ITEM_CATALOG,
  PARTNER_INSTALL_ITEMS_MAX,
  type PartnerInstallItem,
} from "@/lib/installation/partner/install-items";
import PartnerInstallItems from "@/app/partner/orders/PartnerInstallItems";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import { setPartnerInstallItemsAction } from "./partner-actions";

// 본사 PL 패널의 설치 품목: 보기 ↔ 수정(추가·삭제·품목/수량/현장결제 변경), 자동 판별로 되돌리기.

const CUSTOM = "__custom__";

const ERROR_MESSAGES: Record<string, string> = {
  INSTALL_ITEMS_TOO_MANY: `설치 품목은 ${PARTNER_INSTALL_ITEMS_MAX}개까지 넣을 수 있습니다.`,
  INSTALL_ITEM_CODE_INVALID: "품목코드가 올바르지 않습니다.",
  INSTALL_ITEM_NAME_REQUIRED: "직접 입력한 품목의 이름을 적어 주세요.",
  INSTALL_ITEM_NAME_TOO_LONG: "품목 이름은 60자 이하로 적어 주세요.",
  INSTALL_ITEM_QUANTITY_INVALID: "수량은 1~999 사이의 정수로 적어 주세요.",
  ORDER_NOT_PARTNER: "PL ENG 배정 건이 아닙니다.",
  ORDER_NOT_WORKABLE: "취소된 건은 고칠 수 없습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
};

type DraftRow = { key: number; code: string; name: string; quantity: string; onsitePayment: boolean };

let nextKey = 0;
function toDraft(item: PartnerInstallItem): DraftRow {
  return {
    key: nextKey++,
    code: item.code ?? CUSTOM,
    name: item.code ? "" : item.name,
    quantity: String(item.quantity),
    onsitePayment: item.onsitePayment,
  };
}

export default function PartnerInstallItemsEditor({
  installationId,
  items,
  edited,
  editable,
}: {
  installationId: string;
  items: PartnerInstallItem[];
  edited: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Parameters<typeof setPartnerInstallItemsAction>[0]["items"], confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setPartnerInstallItemsAction({ installationId, items: next });
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error] ?? result.error);
        return;
      }
      setRows(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);
  }

  return (
    <div className="mb-4 rounded-md border border-violet-100 bg-white px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">설치 품목</span>
        <span
          className={[
            "rounded px-1.5 py-0.5 text-[11px] font-semibold",
            edited ? "bg-violet-100 text-violet-800" : "bg-zinc-100 text-zinc-600",
          ].join(" ")}
        >
          {edited ? "본사 수정" : "주문 상품 기준 자동"}
        </span>
        {editable && !rows ? (
          <div className="ml-auto flex gap-1.5">
            {edited ? (
              <button
                type="button"
                disabled={busy}
                className={getBackofficeButtonClass("secondary", "sm")}
                onClick={() => save(null, "본사 수정 내용을 지우고 주문 상품 기준 자동 판별로 되돌릴까요?")}
              >
                자동으로 되돌리기
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("secondary", "sm")}
              onClick={() => {
                setError(null);
                setRows(items.map(toDraft));
              }}
            >
              수정
            </button>
          </div>
        ) : null}
      </div>

      {!rows ? (
        <div className="text-sm">
          <PartnerInstallItems items={items} />
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          {rows.length === 0 ? <p className="text-zinc-500">설치 품목이 없습니다.</p> : null}
          {rows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <select
                value={row.code}
                onChange={(event) => update(row.key, { code: event.target.value })}
                className="h-9 min-w-[260px] rounded-md border border-zinc-300 bg-white px-2"
              >
                {PARTNER_INSTALL_ITEM_CATALOG.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} {option.name}
                  </option>
                ))}
                <option value={CUSTOM}>직접 입력 (품목코드 없음)</option>
              </select>
              {row.code === CUSTOM ? (
                <input
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  placeholder="품목 이름"
                  maxLength={60}
                  className="h-9 w-48 rounded-md border border-zinc-300 px-2"
                />
              ) : null}
              <label className="flex items-center gap-1 text-zinc-600">
                ×
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={row.quantity}
                  onChange={(event) => update(row.key, { quantity: event.target.value })}
                  className="h-9 w-20 rounded-md border border-zinc-300 px-2"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-600">
                <input
                  type="checkbox"
                  checked={row.onsitePayment}
                  onChange={(event) => update(row.key, { onsitePayment: event.target.checked })}
                />
                현장결제
              </label>
              <button
                type="button"
                className="text-sm font-medium text-rose-700 hover:underline"
                onClick={() => setRows((current) => current?.filter((candidate) => candidate.key !== row.key) ?? null)}
              >
                삭제
              </button>
            </div>
          ))}
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={rows.length >= PARTNER_INSTALL_ITEMS_MAX}
              className={getBackofficeButtonClass("secondary", "sm")}
              onClick={() =>
                setRows((current) => [
                  ...(current ?? []),
                  { key: nextKey++, code: PARTNER_INSTALL_ITEM_CATALOG[0].code, name: "", quantity: "1", onsitePayment: false },
                ])
              }
            >
              + 품목 추가
            </button>
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("primary", "sm")}
              onClick={() =>
                save(
                  rows.map((row) => ({
                    code: row.code === CUSTOM ? null : row.code,
                    name: row.code === CUSTOM ? row.name : "",
                    quantity: Number(row.quantity),
                    onsitePayment: row.onsitePayment,
                  })),
                )
              }
            >
              저장
            </button>
            <button
              type="button"
              disabled={busy}
              className={getBackofficeButtonClass("secondary", "sm")}
              onClick={() => {
                setRows(null);
                setError(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {error ? <p className="mt-1.5 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
