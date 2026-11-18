"use client";

import Link from "next/link";
import Script from "next/script";
import { useState } from "react";
import {
  ADMIN_ORDER_ITEM_CUSTOM,
  ADMIN_ORDER_ITEM_NAME_MAX,
  ADMIN_ORDER_ITEM_OPTIONS,
  ADMIN_ORDER_ITEM_QUANTITY_MAX,
  ADMIN_ORDER_ITEMS_MAX,
} from "@/lib/installation/orders/source/admin-order-items";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { createManualOrderAction } from "./actions";

// ERP·CJ 어디에도 없는 예외 건을 관리자가 직접 접수한다.
// 접수하면 고객 입력 문자 없이 곧바로 기사 배정 단계로 들어간다.

const TIME_SLOTS = ["오전 09:00 - 12:00", "오후 12:00 - 15:00", "오후 15:00 - 18:00", "상담 후 조율"];

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
  CUSTOMER_NAME_REQUIRED: "고객 이름을 입력해 주세요.",
  CUSTOMER_NAME_TOO_LONG: "고객 이름이 너무 깁니다.",
  CUSTOMER_PHONE_INVALID: "전화번호를 확인해 주세요.",
  CUSTOMER_PHONE_IS_SAFE_NUMBER: "050 안심번호는 만료되므로 고객 실제 휴대폰 번호를 입력해 주세요.",
  CUSTOMER_PHONE_NOT_MOBILE: "휴대폰 번호(010 등)를 입력해 주세요.",
  INSTALL_ADDRESS_REQUIRED: "설치 주소를 입력해 주세요.",
  INSTALL_ADDRESS_UNPARSEABLE: "주소에서 시/도·시/군/구를 읽지 못했습니다. 주소 검색으로 입력해 주세요.",
  INSTALL_DATE_INVALID: "설치일을 확인해 주세요.",
  INSTALL_ITEMS_REQUIRED: "설치 품목을 1개 이상 넣어 주세요.",
  INSTALL_ITEMS_TOO_MANY: `설치 품목은 ${ADMIN_ORDER_ITEMS_MAX}개까지 넣을 수 있습니다.`,
  INSTALL_ITEM_INVALID: "설치 품목을 다시 골라 주세요.",
  INSTALL_ITEM_NAME_REQUIRED: "직접 입력 품목의 이름을 적어 주세요.",
  INSTALL_ITEM_NAME_TOO_LONG: `품목 이름은 ${ADMIN_ORDER_ITEM_NAME_MAX}자 이내로 적어 주세요.`,
  INSTALL_ITEM_QUANTITY_INVALID: `수량은 1~${ADMIN_ORDER_ITEM_QUANTITY_MAX} 사이로 입력해 주세요.`,
  NOTE_TOO_LONG: "메모는 1000자 이내로 입력해 주세요.",
  MANUAL_ORDER_CREATE_FAILED: "접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

type DaumPostcode = new (opts: { oncomplete: (data: { address: string }) => void }) => { open: () => void };

type ItemRow = { key: number; option: string; customName: string; quantity: string };

const inputClass =
  "h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-zinc-950";
const labelClass = "text-xs font-bold text-zinc-600";

let nextItemKey = 1;
function newItemRow(): ItemRow {
  return { key: nextItemKey++, option: ADMIN_ORDER_ITEM_OPTIONS[0].value, customName: "", quantity: "1" };
}

export default function ManualOrderPanel() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => [newItemRow()]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setAddress("");
    setAddressDetail("");
    setInstallDate("");
    setTimeSlot("");
    setItems([newItemRow()]);
    setNote("");
    setError(null);
  }

  function openPostcode() {
    const Postcode = (window as unknown as { daum?: { Postcode: DaumPostcode } }).daum?.Postcode;
    if (!Postcode) {
      setError("주소 검색을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    new Postcode({ oncomplete: (data) => setAddress(data.address) }).open();
  }

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function submit() {
    setError(null);
    if (!installDate) {
      setError(ERROR_MESSAGES.INSTALL_DATE_INVALID);
      return;
    }
    const confirmed = window.confirm(
      `${name.trim() || "고객"} 님 주문을 접수할까요?\n고객 입력 문자 없이 바로 기사 배정 단계로 들어갑니다.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await createManualOrderAction({
        customerName: name,
        customerPhone: phone,
        installAddress: address,
        installAddressDetail: addressDetail,
        installDate,
        installTimeSlot: timeSlot,
        items: items.map((item) => ({
          option: item.option,
          customName: item.option === ADMIN_ORDER_ITEM_CUSTOM ? item.customName : null,
          quantity: Number(item.quantity),
        })),
        note,
      });
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error] ?? `접수하지 못했습니다. (${result.error})`);
        return;
      }
      setCreatedOrderId(result.installationOrderId);
      reset();
      setOpen(false);
    } catch {
      setError(ERROR_MESSAGES.MANUAL_ORDER_CREATE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-zinc-950">주문 직접 입력</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            ERP·CJ에 없는 예외 건을 관리자가 직접 접수합니다. 고객 입력 문자 없이 바로 기사 배정 단계로 들어갑니다.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setCreatedOrderId(null);
              setError(null);
              setOpen(true);
            }}
            className={getBackofficeButtonClass("primary")}
          >
            직접 입력
          </button>
        ) : null}
      </div>

      {createdOrderId && !open ? (
        <p className="mt-3 text-sm font-semibold text-emerald-700">
          접수했습니다.{" "}
          <Link href={`/backoffice/installations/${createdOrderId}`} className="underline">
            설치 건 보기
          </Link>
        </p>
      ) : null}

      {open ? (
        <div className="mt-4 grid max-w-2xl gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>고객 이름</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>전화번호</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                placeholder="010-0000-0000"
                className={inputClass}
              />
            </label>
          </div>

          <label className="grid gap-1">
            <span className={labelClass}>설치 주소</span>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="도로명 또는 지번 주소"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={openPostcode}
                className="shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                주소 검색
              </button>
            </div>
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>상세 주소</span>
            <input
              value={addressDetail}
              onChange={(event) => setAddressDetail(event.target.value)}
              placeholder="동/호수"
              className={inputClass}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>설치일</span>
              <input
                type="date"
                value={installDate}
                onChange={(event) => setInstallDate(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>시간대</span>
              <select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} className={inputClass}>
                <option value="">선택 안 함</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2">
            <span className={labelClass}>설치 품목</span>
            {items.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center gap-2">
                <select
                  value={item.option}
                  onChange={(event) => updateItem(item.key, { option: event.target.value })}
                  className={`${inputClass} w-64`}
                  aria-label="설치 품목"
                >
                  {ADMIN_ORDER_ITEM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value={ADMIN_ORDER_ITEM_CUSTOM}>직접 입력</option>
                </select>
                {item.option === ADMIN_ORDER_ITEM_CUSTOM ? (
                  <input
                    value={item.customName}
                    onChange={(event) => updateItem(item.key, { customName: event.target.value })}
                    maxLength={ADMIN_ORDER_ITEM_NAME_MAX}
                    placeholder="품목 이름"
                    aria-label="직접 입력 품목 이름"
                    className={`${inputClass} w-48`}
                  />
                ) : null}
                <input
                  type="number"
                  min={1}
                  max={ADMIN_ORDER_ITEM_QUANTITY_MAX}
                  value={item.quantity}
                  onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                  aria-label="수량"
                  className={`${inputClass} w-20`}
                />
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                    className="text-sm font-semibold text-zinc-500 hover:text-rose-600"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
            ))}
            {items.length < ADMIN_ORDER_ITEMS_MAX ? (
              <button
                type="button"
                onClick={() => setItems((current) => [...current, newItemRow()])}
                className="w-fit text-sm font-semibold text-zinc-700 underline"
              >
                + 품목 추가
              </button>
            ) : null}
          </div>

          <label className="grid gap-1">
            <span className={labelClass}>메모 (기사에게 요청사항으로 보입니다)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={1000}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
            />
          </label>

          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={submit} className={getBackofficeButtonClass("primary")}>
              {busy ? "접수 중…" : "접수"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
