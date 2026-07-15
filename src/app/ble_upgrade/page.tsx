"use client";

import { useState } from "react";
import QrScanModal from "@/app/reg/QrScanModal";

export default function BleUpgradePage() {
  const [sn, setSn] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<{
    sn: string;
    model: string;
    purchaseStatus: string;
  } | null>(null);

  const [isScanning, setIsScanning] = useState(false);

  // 校验 SN 的合法性
  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setDeviceInfo(null);

    const trimmedSn = sn.trim();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();

    if (!trimmedSn) {
      setErrorMessage("기기 SN을 입력해 주세요.");
      return;
    }
    if (!trimmedName) {
      setErrorMessage("이름을 입력해 주세요.");
      return;
    }
    if (!trimmedPhone) {
      setErrorMessage("휴대폰 번호를 입력해 주세요.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/ble_upgrade/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sn: trimmedSn, contact: trimmedPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "기기 검증에 실패했습니다.");
      }

      setDeviceInfo(data.device);
      setSuccessMessage(data.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoadingState(false);
    }
  };

  // 跳转至 Cafe24 结算
  const handleRedirectToMall = () => {
    if (!deviceInfo) return;

    // 默认使用商城域名 aqaralife.shop，商品编号 472
    const mallDomain = process.env.NEXT_PUBLIC_CAFE24_MALL_DOMAIN || "aqaralife.shop";
    const productNo = process.env.NEXT_PUBLIC_CAFE24_PRODUCT_NO || "472";

    // 构造跳转链接
    const targetUrl = new URL(`https://${mallDomain}/product/detail.html`);
    targetUrl.searchParams.set("product_no", productNo);
    targetUrl.searchParams.set("sn", deviceInfo.sn);
    targetUrl.searchParams.set("name", name.trim());
    targetUrl.searchParams.set("phone", phone.trim());
    if (email.trim()) {
      targetUrl.searchParams.set("email", email.trim());
    }

    // 跳转
    window.location.href = targetUrl.toString();
  };

  const setLoadingState = (state: boolean) => {
    setLoading(state);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f1ea_0%,#fbfaf8_55%,#ffffff_100%)] text-zinc-900 font-sans">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12 sm:px-10">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-end">
          <span className="rounded-full border border-black/10 bg-white/70 px-4 py-1 text-xs font-semibold tracking-wider text-zinc-600 uppercase">
            Upgrade Portal
          </span>
        </div>

        {/* Two-Column split layout */}
        <div className="grid gap-8 md:grid-cols-12 items-stretch">
          
          {/* Left Column: Hero Description */}
          <div className="md:col-span-6 flex flex-col justify-between rounded-3xl border border-black/10 bg-white/80 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <div className="space-y-6">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Feature Unlock
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl leading-tight">
                L100 SE<br />
                Zigbee 기능 업그레이드
              </h1>
              <p className="text-sm leading-relaxed text-zinc-600">
                출고 시 BLE 전용으로 판매된 L100 SE 도어락을 유료 업그레이드하시면 스마트홈 연동을 위한 Zigbee 기능(망 연동)이 잠금 해제됩니다.
              </p>
              <p className="text-sm leading-relaxed text-zinc-600">
                본 페이지에서 기기 일련번호(SN)와 구매자 정보를 검증한 뒤 공식 쇼핑몰 결제 페이지로 이동해 주시기 바랍니다. 결제가 완료되면 해당 기기의 업그레이드 상태가 즉시 시스템에 반영됩니다.
              </p>
            </div>

            {/* Price Box */}
            <div className="mt-8 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-lg">
              <span className="text-xs font-medium text-zinc-400">업그레이드 금액</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold">₩</span>
                <span className="text-4xl font-extrabold tracking-tight">39,000</span>
              </div>
              <p className="mt-2 text-xs leading-normal text-zinc-400">
                공식 쇼핑몰 결제 페이지로 이동 후 안전하게 결제를 진행할 수 있습니다. (신용카드, Toss, 카카오페이 지원)
              </p>
            </div>
          </div>

          {/* Right Column: Form Panel */}
          <div className="md:col-span-6 flex flex-col justify-between rounded-3xl border border-black/10 bg-white/80 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-6">구매자 및 기기 검증</h2>
              
              <form onSubmit={handleValidate} className="space-y-4">
                
                {/* Device SN Field */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    기기 일련번호 (SN)
                  </label>
                  <p className="text-xs text-zinc-500 mb-2">
                    도어락 본체 측면 스티커의 일련번호(SN)를 입력하거나 카메라로 스캔하세요.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sn}
                      onChange={(e) => {
                        setSn(e.target.value.toUpperCase());
                        setDeviceInfo(null);
                      }}
                      placeholder="예: A01460/LS1EJ000059"
                      className="flex-1 min-w-0 rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setIsScanning(true)}
                      className="shrink-0 rounded-xl border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 px-4 py-3 text-sm font-semibold transition-colors"
                      disabled={loading}
                    >
                      QR 스캔
                    </button>
                  </div>
                </div>

                {/* Name Field */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    주문자 이름
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDeviceInfo(null);
                    }}
                    placeholder="예: 홍길동"
                    className="w-full rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Phone Field */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    휴대폰 번호
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setDeviceInfo(null);
                    }}
                    placeholder="예: 01012345678"
                    className="w-full rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Email Field */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    이메일 주소 <span className="text-zinc-400 font-normal">(선택)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setDeviceInfo(null);
                    }}
                    placeholder="user@example.com"
                    className="w-full rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                    disabled={loading}
                  />
                </div>

                {/* Validate Button */}
                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white py-3.5 text-sm font-bold tracking-wide transition-colors shadow-md disabled:bg-zinc-300 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? "기기 검증 중..." : "기기 확인 및 정보 검증"}
                </button>
              </form>

              {/* Status Message Display */}
              {errorMessage && (
                <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs leading-normal text-rose-700">
                  ⚠️ {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs leading-normal text-emerald-700">
                  ✓ {successMessage}
                </div>
              )}
            </div>

            {/* Device Info Card & Redirect Button */}
            {deviceInfo && (
              <div className="mt-6 border-t border-zinc-200/60 pt-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      기기 정보 확인 완료
                    </h3>
                    <div className="mt-2 text-sm text-zinc-700 space-y-1">
                      <p><span className="font-medium">기기 일련번호:</span> {deviceInfo.sn}</p>
                      <p><span className="font-medium">모델명:</span> {deviceInfo.model}</p>
                      <p>
                        <span className="font-medium">현재 구매 상태:</span>{" "}
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                          {deviceInfo.purchaseStatus === "paid" ? "결제 완료" : "미결제"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRedirectToMall}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3 text-sm font-bold tracking-wide transition-colors shadow-md"
                  >
                    공식 쇼핑몰 결제 페이지로 이동
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Camera QR Scanning Modal */}
      {isScanning && (
        <QrScanModal
          title="기기 일련번호 QR 스캔"
          onClose={() => setIsScanning(false)}
          onResult={(resultSn) => {
            setSn(resultSn);
            setIsScanning(false);
            setDeviceInfo(null);
            setSuccessMessage("");
            setErrorMessage("");
          }}
        />
      )}
    </div>
  );
}
