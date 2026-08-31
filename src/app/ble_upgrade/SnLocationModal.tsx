"use client";

import { useEffect, useState } from "react";

type Props = {
  onClose: () => void;
};

export default function SnLocationModal({ onClose }: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  // Close on ESC (zoom view first, then the modal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomSrc) setZoomSrc(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomSrc]);

  const shot = (src: string, alt: string) => (
    <button
      type="button"
      onClick={() => setZoomSrc(src)}
      className="block w-full overflow-hidden rounded-2xl border border-white/10 bg-white p-2 transition-transform active:scale-[0.99]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full" />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="기기 일련번호(SN) 확인 방법"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-3xl border border-white/10 bg-[#0b1220] shadow-[0_24px_70px_rgba(2,10,40,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <h3 className="text-base font-bold text-white">기기 일련번호(SN) 확인 방법</h3>
          <p className="mt-1 text-xs text-white/45">
            아래 두 가지 방법 중 편한 방법으로 확인하세요. 이미지를 누르면 크게 볼 수 있습니다.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* 방법 1 — 본체 라벨 */}
          <section>
            <h4 className="mb-1 text-sm font-semibold text-sky-300">
              방법 1. 도어락 본체 라벨
            </h4>
            <p className="mb-3 text-xs leading-relaxed text-white/55">
              실내측 본체의 <b className="text-white/80">우측 옆면</b> 라벨에서 확인할 수 있습니다.
              라벨의 QR 코드를 스캔해도 됩니다.
            </p>
            {shot("/ble_upgrade/sn-location-device.webp", "도어락 본체 우측 옆면의 SN 라벨 위치")}
          </section>

          {/* 방법 2 — Aqara Home 앱 */}
          <section>
            <h4 className="mb-1 text-sm font-semibold text-sky-300">방법 2. Aqara Home 앱</h4>
            <p className="mb-2 text-xs leading-relaxed text-white/55">
              앱에 도어락이 등록되어 있다면 앱에서도 확인할 수 있습니다.
            </p>
            <ol className="mb-3 space-y-1 text-xs leading-relaxed text-white/55">
              <li>
                <span className="text-sky-400">1.</span> 도어락 화면 우측 상단의 ⋯ 클릭
              </li>
              <li>
                <span className="text-sky-400">2.</span> 맨 위의 기기 이름(스마트 도어락 L100 SE)
                클릭
              </li>
              <li>
                <span className="text-sky-400">3.</span> 장치 정보에서{" "}
                <b className="text-white/80">펌웨어 버전</b> 클릭
              </li>
              <li>
                <span className="text-sky-400">4.</span> 맨 아래{" "}
                <b className="text-white/80">SN</b> 항목이 일련번호입니다
              </li>
            </ol>
            {shot("/ble_upgrade/sn-location-app.webp", "Aqara Home 앱에서 SN을 확인하는 단계")}
          </section>

          <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[11px] leading-relaxed text-white/50">
            확인한 SN을 그대로 입력해 주세요. 예:{" "}
            <b className="text-white/70">A01979/LS1FNE00059</b>
          </p>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-white/15 bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 이미지 확대 보기 */}
      {zoomSrc && (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setZoomSrc(null);
          }}
        >
          <div className="max-w-full overflow-x-auto rounded-2xl bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomSrc}
              alt="일련번호(SN) 위치 확대 이미지"
              className="h-[76vh] max-w-none"
            />
          </div>
          <p className="mt-4 text-center text-xs text-white/60">
            좌우로 밀어서 볼 수 있습니다. 화면을 누르면 닫힙니다.
          </p>
        </div>
      )}
    </div>
  );
}
