"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { updateCustomerRequestByAdminAction } from "./edit-actions";
import { getAdminEditErrorMessage } from "./admin-edit-messages";

// 고객 입력 화면과 같은 시간대 목록.
const TIME_SLOTS = ["오전 09:00 - 12:00", "오후 12:00 - 15:00", "오후 15:00 - 18:00", "상담 후 조율"];

type DaumPostcode = new (opts: { oncomplete: (data: { address: string }) => void }) => { open: () => void };

export type CustomerRequestEditValues = {
  installAddress: string | null;
  installAddressDetail: string | null;
  installDate: string | null;
  installTimeSlot: string | null;
  customerPhone: string | null;
};

export default function CustomerRequestEditPanel({
  orderId,
  orderStatus,
  initial,
}: {
  orderId: string;
  orderStatus: string;
  initial: CustomerRequestEditValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [address, setAddress] = useState(initial.installAddress ?? "");
  const [addressDetail, setAddressDetail] = useState(initial.installAddressDetail ?? "");
  const [installDate, setInstallDate] = useState(initial.installDate ?? "");
  const [timeSlot, setTimeSlot] = useState(initial.installTimeSlot ?? "");
  const [phone, setPhone] = useState(initial.customerPhone ?? "");
  const [reason, setReason] = useState("");

  const slotOptions = timeSlot && !TIME_SLOTS.includes(timeSlot) ? [timeSlot, ...TIME_SLOTS] : TIME_SLOTS;
  const inAdminReview = orderStatus === "WAITING_ADMIN_REVIEW";

  function openPostcode() {
    const Postcode = (window as unknown as { daum?: { Postcode: DaumPostcode } }).daum?.Postcode;
    if (!Postcode) {
      setError("주소 검색을 불러오지 못했습니다. 주소를 직접 입력해 주세요.");
      return;
    }
    new Postcode({
      oncomplete(data) {
        setAddress(data.address);
      },
    }).open();
  }

  function reset() {
    setAddress(initial.installAddress ?? "");
    setAddressDetail(initial.installAddressDetail ?? "");
    setInstallDate(initial.installDate ?? "");
    setTimeSlot(initial.installTimeSlot ?? "");
    setPhone(initial.customerPhone ?? "");
    setReason("");
    setError(null);
  }

  async function save() {
    if (!reason.trim()) {
      setError(getAdminEditErrorMessage("EDIT_REASON_REQUIRED"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updateCustomerRequestByAdminAction({
      orderId,
      installAddress: address,
      installAddressDetail: addressDetail,
      installDate,
      installTimeSlot: timeSlot,
      customerPhone: phone,
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(getAdminEditErrorMessage(result.error));
      return;
    }
    setNotice(result.message ?? "수정했습니다.");
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-zinc-950">예약 정보 수정</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            기사에게 요청이 나가기 전까지 고객 요청에 따라 주소·설치일·시간대·전화번호를 고칠 수 있습니다.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => {
              reset();
              setNotice(null);
              setOpen(true);
            }}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            수정
          </button>
        ) : null}
      </div>

      {notice && !open ? <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}

      {open ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-zinc-600">설치 주소</span>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                placeholder="도로명 또는 지번 주소"
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
            <span className="text-xs font-bold text-zinc-600">상세 주소</span>
            <input
              value={addressDetail}
              onChange={(event) => setAddressDetail(event.target.value)}
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              placeholder="동/호수"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-zinc-600">설치일</span>
              <input
                type="date"
                value={installDate}
                onChange={(event) => setInstallDate(event.target.value)}
                className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-zinc-600">시간대</span>
              <select
                value={timeSlot}
                onChange={(event) => setTimeSlot(event.target.value)}
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-950"
              >
                <option value="">선택 안 함</option>
                {slotOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-zinc-600">고객 전화번호</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              placeholder="010-0000-0000"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-zinc-600">수정 사유 (이력에 남습니다)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
              placeholder="예: 고객 요청으로 설치일 변경"
            />
          </label>
          {inAdminReview ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              지금은 관리자 배정 검토 중입니다. 주소나 설치일을 바꾸면 예전 정보로 뽑은 기사 후보는 무효가 되고, 새 정보로 기사를 다시
              찾습니다.
            </p>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
