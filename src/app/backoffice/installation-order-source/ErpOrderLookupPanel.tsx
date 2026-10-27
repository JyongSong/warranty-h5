"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type { ErpOrderLookupItem } from "@/lib/installation/orders/source/manual-add";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatBackofficeText,
} from "@/lib/backoffice/table-formatting";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { addErpOrderToQueueAction, lookupErpOrderByNumberAction } from "./actions";

// 정기 동기화(오늘 납기 · 용역 품목 · 전량 출고)에 걸러진 특수 주문을
// 주문번호/출고번호로 찾아 설치 업무 큐에 직접 넣는다.

const ERROR_MESSAGES: Record<string, string> = {
  ORDER_NUMBER_REQUIRED: "주문번호 또는 출고번호를 입력해 주세요.",
  ORDER_NUMBER_TOO_LONG: "번호가 너무 깁니다.",
  ERP_ORDER_NOT_FOUND: "ERP에서 주문을 다시 찾지 못했습니다. 다시 조회해 주세요.",
  ALREADY_IN_QUEUE: "이미 설치 업무 큐에 있는 주문입니다.",
  QUEUE_ADD_FAILED: "큐 추가에 실패했습니다.",
  ERP_LOOKUP_FAILED: "ERP 조회 중 오류가 발생했습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
};

const STATUS_LABELS: Record<string, string> = {
  CUSTOMER_INPUT_SMS_REQUIRED: "고객 입력 문자 발송 전",
  WAITING_CUSTOMER_INPUT: "고객 입력 대기",
  READY_FOR_CANDIDATE_SELECTION: "기사 후보 선정",
  WAITING_ADMIN_REVIEW: "후보 검토 대기",
  WAITING_INSTALLER_RESPONSE: "기사 응답 대기",
  INSTALLER_ASSIGNED: "기사 배정 완료",
  WAITING_HQ_REVIEW: "본사 검수 대기",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

export default function ErpOrderLookupPanel() {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [items, setItems] = useState<ErpOrderLookupItem[]>([]);
  const [addedOrderIds, setAddedOrderIds] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [addingSourceKey, setAddingSourceKey] = useState<string | null>(null);

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    setErrorMessage(null);

    startLookup(async () => {
      const result = await lookupErpOrderByNumberAction(nextQuery);
      if (!result.ok) {
        setErrorMessage(toMessage(result.error));
        return;
      }
      setSearchedQuery(nextQuery);
      setItems(result.items);
      setAddedOrderIds({});
    });
  }

  async function handleAdd(item: ErpOrderLookupItem) {
    if (!searchedQuery) return;
    const confirmed = window.confirm(
      `${item.customer_name ?? "고객"} 주문을 설치 업무 큐에 추가할까요?\n추가하면 일반 주문과 같이 고객에게 설치 예약 입력 문자가 자동 발송됩니다.`,
    );
    if (!confirmed) return;

    setErrorMessage(null);
    setAddingSourceKey(item.source_key);
    try {
      const result = await addErpOrderToQueueAction({ query: searchedQuery, sourceKey: item.source_key });
      if (!result.ok) {
        setErrorMessage(toMessage(result.error));
        return;
      }
      setAddedOrderIds((current) => ({ ...current, [item.source_key]: result.installationOrderId }));
    } finally {
      setAddingSourceKey(null);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
      <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-500">
          주문번호 / 출고번호로 직접 조회
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예) 20261026-0000097, ISU20261001622"
            className="h-9 w-80 max-w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
          />
        </label>
        <button type="submit" disabled={isLookingUp || !query.trim()} className={getBackofficeButtonClass("primary")}>
          {isLookingUp ? "조회 중…" : "번호 조회"}
        </button>
        <p className="w-full text-xs text-zinc-500">
          납기일자 · 출고 상태 · 용역 품목 조건과 관계없이 찾습니다. 자동으로 들어오지 않은 주문을 설치 업무 큐에 직접 추가할 때 사용하세요.
        </p>
      </form>

      {errorMessage ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {searchedQuery !== null && items.length === 0 && !errorMessage ? (
        <p className="mt-3 text-sm text-zinc-500">
          ERP에서 &quot;{searchedQuery}&quot; 주문을 찾지 못했습니다. 번호를 확인해 주세요. (연락처가 없는 주문은 조회되지 않습니다)
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <ErpOrderLookupResult
              key={item.source_key}
              item={item}
              addedOrderId={addedOrderIds[item.source_key] ?? null}
              isAdding={addingSourceKey === item.source_key}
              onAdd={() => handleAdd(item)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErpOrderLookupResult({
  item,
  addedOrderId,
  isAdding,
  onAdd,
}: {
  item: ErpOrderLookupItem;
  addedOrderId: string | null;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const warnings = [
    !item.fully_shipped ? "미출고 또는 부분 출고" : null,
    !item.has_service_item ? "설치비(용역) 품목 없음" : null,
    item.source_error_code ? "연락처 형식 오류" : null,
  ].filter((value): value is string => value !== null);

  return (
    <li className="rounded-md border border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="whitespace-nowrap text-zinc-500">고객명</dt>
          <dd className="font-medium text-zinc-900">{formatBackofficeText(item.customer_name)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">연락처</dt>
          <dd className="text-zinc-800">{formatBackofficePhone(item.phone)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">주소</dt>
          <dd className="break-keep text-zinc-800">{formatBackofficeText(item.address)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">납기일자</dt>
          <dd className="text-zinc-800">{formatBackofficeDateTime(item.due_date)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">주문번호</dt>
          <dd className="text-zinc-800">{formatBackofficeText(item.order_numbers)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">출고번호</dt>
          <dd className="text-zinc-800">{formatBackofficeText(item.no_girl)}</dd>
          <dt className="whitespace-nowrap text-zinc-500">메모</dt>
          <dd className="break-keep font-medium text-zinc-900">{formatBackofficeText(item.memo)}</dd>
        </dl>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {addedOrderId ? (
            <>
              <span className="text-sm font-semibold text-emerald-700">설치 업무 큐에 추가했습니다</span>
              <Link href={`/backoffice/installations/${addedOrderId}`} className={getBackofficeButtonClass("secondary", "sm")}>
                상세 보기
              </Link>
            </>
          ) : item.existing_orders.length > 0 ? (
            <>
              <span className="text-sm font-semibold text-zinc-600">이미 설치 업무 큐에 있음</span>
              {item.existing_orders.map((order) => (
                <Link
                  key={order.installationOrderId}
                  href={`/backoffice/installations/${order.installationOrderId}`}
                  className={getBackofficeButtonClass("secondary", "sm")}
                >
                  {STATUS_LABELS[order.status] ?? order.status} · 상세 보기
                </Link>
              ))}
            </>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={isAdding}
              className={getBackofficeButtonClass("primary")}
            >
              {isAdding ? "추가 중…" : "설치 업무 큐에 추가"}
            </button>
          )}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span
              key={warning}
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function toMessage(errorCode: string) {
  return ERROR_MESSAGES[errorCode] ?? errorCode;
}
