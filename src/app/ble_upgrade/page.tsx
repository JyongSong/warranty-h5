"use client";

import { useState, useEffect } from "react";
import QrScanModal from "@/app/reg/QrScanModal";
import SnLocationModal from "./SnLocationModal";
import { normalizePhone, formatKrPhone } from "@/lib/phone";

export default function BleUpgradePage() {
  const [sn, setSn] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const [snHelpOpen, setSnHelpOpen] = useState(false);

  // Mobile floating jump button: hide once the purchase form is in view
  const [showJumpBtn, setShowJumpBtn] = useState(true);

  // SMS Verification States
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [smsTimer, setSmsTimer] = useState(0);
  const [smsMessage, setSmsMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // SMS Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (smsTimer > 0) {
      interval = setInterval(() => {
        setSmsTimer((prev) => prev - 1);
      }, 1000);
    } else if (smsTimer === 0 && smsSent && !isPhoneVerified) {
      setSmsMessage({ text: "인증 시간이 만료되었습니다. 다시 시도해 주세요.", isError: true });
      setSmsSent(false);
    }
    return () => clearInterval(interval);
  }, [smsTimer, smsSent, isPhoneVerified]);

  // Toggle the mobile floating button based on form visibility
  useEffect(() => {
    const el = document.getElementById("purchase-form");
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowJumpBtn(!entry.isIntersecting),
      { rootMargin: "0px 0px -35% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatKrPhone(e.target.value));
    setIsPhoneVerified(false);
    setSmsSent(false);
    setSmsTimer(0);
    setSmsMessage(null);
  };

  const sendSmsCode = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 9) {
      setSmsMessage({ text: "올바른 휴대폰 번호를 입력해 주세요.", isError: true });
      return;
    }

    setSendingSms(true);
    setSmsMessage(null);

    try {
      const response = await fetch("/api/auth/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: normalizedPhone }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "인증번호 발송에 실패했습니다.");
      }

      setSmsSent(true);
      setVerificationCode("");
      setIsPhoneVerified(false);
      setSmsTimer(180); // 3 mins
      setSmsMessage({ text: "인증번호가 발송되었습니다.", isError: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSmsMessage({ text: msg, isError: true });
    } finally {
      setSendingSms(false);
    }
  };

  const verifySmsCode = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!verificationCode.trim()) {
      setSmsMessage({ text: "인증번호를 입력해 주세요.", isError: true });
      return;
    }

    setVerifyingCode(true);
    setSmsMessage(null);

    try {
      const response = await fetch("/api/auth/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone: normalizedPhone, code: verificationCode }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "인증번호 확인에 실패했습니다.");
      }

      setIsPhoneVerified(true);
      setSmsTimer(0);
      setSmsMessage({ text: "인증되었습니다.", isError: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSmsMessage({ text: msg, isError: true });
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleRedirectToMall = (deviceInfo: { sn: string }) => {
    const mallDomain = process.env.NEXT_PUBLIC_CAFE24_MALL_DOMAIN || "aqaralife.shop";
    const productNo = process.env.NEXT_PUBLIC_CAFE24_PRODUCT_NO || "472";

    const targetUrl = new URL(`https://${mallDomain}/product/detail.html`);
    targetUrl.searchParams.set("product_no", productNo);
    targetUrl.searchParams.set("sn", deviceInfo.sn);
    targetUrl.searchParams.set("name", name.trim());
    targetUrl.searchParams.set("phone", phone.trim());
    targetUrl.searchParams.set("auto_buy", "true");
    if (email.trim()) {
      targetUrl.searchParams.set("email", email.trim());
    }

    window.location.href = targetUrl.toString();
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedSn = sn.trim();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedSn) {
      setErrorMessage("기기 SN을 입력해 주세요.");
      return;
    }
    if (!trimmedName) {
      setErrorMessage("이름을 입력해 주세요.");
      return;
    }
    if (!trimmedPhone || !isPhoneVerified) {
      setErrorMessage("휴대폰 번호 인증을 완료해 주세요.");
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

      // Directly redirect to mall upon success
      handleRedirectToMall(data.device);
      
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setLoading(false); // Only stop loading if error, redirect will unload the page
    }
  };
  const features = [
    { title: "허브 연동", desc: "Aqara Hub와 연결" },
    { title: "원격 알림", desc: "도어락 상태 알림 수신" },
    { title: "원격 제어", desc: "어디서나 잠금 해제" },
    { title: "원격 자동화 기능", desc: "스마트 자동화 시나리오" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060913] text-white font-sans">
      {/* Ambient brand glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(56,132,255,0.35),transparent_70%)] blur-2xl" />
        <div className="absolute top-1/3 -right-24 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.22),transparent_70%)] blur-2xl" />
        <div className="absolute bottom-0 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.20),transparent_70%)] blur-2xl" />
      </div>

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-14 sm:px-8">

        {/* ===== Hero ===== */}
        <section className="flex flex-col items-center text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-sky-300/90">
            AQARA · 스마트 도어락 L100 SE 전용
          </p>

          {/* IoT Pass card (thumbnail image) */}
          <div className="relative mt-6 w-full max-w-[440px]">
            <div className="absolute inset-0 -z-10 rounded-[28px] bg-sky-500/20 blur-3xl" />
            <img
              src="/images/iot-pass-card.png"
              alt="Aqara L100 SE 전용 IoT Pass 카드"
              className="w-full rounded-[24px] shadow-[0_30px_80px_rgba(2,10,40,0.6)]"
            />
          </div>

          <h1 className="mt-8 bg-gradient-to-r from-white via-sky-100 to-cyan-200 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl">
            IoT Pass
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
            L100 SE 도어락의 <span className="text-white/90">Aqara Hub 연동 기능</span>을 활성화하여
            스마트홈 도어락으로 업그레이드하는 상품입니다.
          </p>

          {/* Price pill */}
          <div className="mt-8 inline-flex items-baseline gap-2 rounded-full border border-white/10 bg-white/[0.06] px-7 py-3 backdrop-blur-md">
            <span className="text-xs font-medium text-white/50">업그레이드 금액</span>
            <span className="ml-1 text-2xl font-bold text-white">₩77,000</span>
          </div>
        </section>

        {/* ===== Two-column: Info + Form ===== */}
        <div className="grid gap-6 md:grid-cols-12 md:items-start">

          {/* Left: Features & Notices */}
          <div className="space-y-6 md:col-span-6">
            {/* Features grid */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-md">
              <h3 className="mb-1 text-base font-bold text-white">IoT 패스로 확장되는 기능</h3>
              <p className="mb-5 text-xs text-white/50">
                기존 도어락(L100 SE)을 교체하지 않고 스마트홈 기능을 확장합니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-4"
                  >
                    <p className="text-sm font-semibold text-sky-200">{f.title}</p>
                    <p className="mt-1 text-[11px] leading-snug text-white/50">{f.desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs font-medium text-white/70">
                Aqara 카메라·도어벨 연동, Google Home 등 타사 플랫폼 연동도 지원합니다.
              </p>
              <p className="mt-2 text-xs text-amber-300/80">
                ※ L100 SE는 업그레이드 후에도 SmartThings를 지원하지 않습니다.
              </p>
            </div>

            {/* Notices */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-md">
              <h3 className="mb-3 text-base font-bold text-white">필수 안내사항</h3>
              <ul className="space-y-2 text-xs leading-relaxed text-white/60">
                <li className="flex gap-2"><span className="text-sky-400">•</span>본 상품은 L100 SE의 Aqara Hub 연결 기능을 활성화하는 유상 업그레이드 상품입니다.</li>
                <li className="flex gap-2"><span className="text-sky-400">•</span>상기 기능은 업그레이드 구매 후 Aqara Hub를 연결해야 사용할 수 있습니다.</li>
                <li className="flex gap-2"><span className="text-sky-400">•</span>업그레이드는 계정이 아닌 도어락의 제품 SN 기준으로 적용되며, 기기를 양도하거나 계정을 변경해도 권한은 해당 기기에 유지됩니다.</li>
                <li className="flex gap-2"><span className="text-sky-400">•</span>구매 전 대상 제품이 L100 SE인지 확인해 주세요.</li>
                <li className="flex gap-2"><span className="text-sky-400">•</span>이미 업그레이드가 완료된 제품은 중복 구매할 수 없습니다.</li>
              </ul>
            </div>
          </div>

          {/* Right: Purchase Form */}
          <div id="purchase-form" className="scroll-mt-6 md:col-span-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-7 shadow-[0_24px_70px_rgba(2,10,40,0.5)] backdrop-blur-xl">
              <h2 className="mb-1 text-lg font-bold text-white">구매자 및 기기 검증</h2>
              <p className="mb-6 text-xs text-white/45">정보 확인 후 공식 쇼핑몰 결제 페이지로 이동합니다.</p>

              <form onSubmit={handleValidate} className="space-y-4">

                {/* Device SN Field */}
                <div>
                  <label className="mb-1 block text-sm font-semibold text-white/80">
                    기기 일련번호 (SN)
                  </label>
                  <p className="mb-2 text-xs text-white/40">
                    도어락 본체 측면 스티커의 일련번호(SN)를 입력하거나 카메라로 스캔하세요.{" "}
                    <button
                      type="button"
                      onClick={() => setSnHelpOpen(true)}
                      className="ml-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 align-middle text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-400/20 active:bg-sky-400/25"
                    >
                      <span aria-hidden="true">?</span>SN 위치 확인
                    </button>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sn}
                      onChange={(e) => {
                        setSn(e.target.value.toUpperCase());
                      }}
                      placeholder="예: A01460/LS1EJ000059"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-sky-400/70 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setIsScanning(true)}
                      className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 active:bg-white/[0.14]"
                      disabled={loading}
                    >
                      QR 스캔
                    </button>
                  </div>
                </div>

                {/* Name Field */}
                <div>
                  <label className="mb-1 block text-sm font-semibold text-white/80">
                    주문자 이름
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                    }}
                    placeholder="예: 홍길동"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-sky-400/70 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Phone Field with SMS Verification */}
                <div>
                  <label className="mb-1 block text-sm font-semibold text-white/80">
                    휴대폰 번호
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="예: 010-1234-5678"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-sky-400/70 focus:outline-none focus:ring-1 focus:ring-sky-400/40 disabled:bg-white/[0.03] disabled:text-white/40"
                      required
                      disabled={loading || isPhoneVerified}
                    />
                    {!isPhoneVerified && (
                      <button
                        type="button"
                        onClick={sendSmsCode}
                        disabled={sendingSms || normalizePhone(phone).length < 9 || smsTimer > 0}
                        className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 active:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingSms ? "발송 중..." : smsTimer > 0 ? `${smsTimer}초` : "인증번호 발송"}
                      </button>
                    )}
                    {isPhoneVerified && (
                      <span className="inline-flex shrink-0 items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-300">
                        ✓ 인증완료
                      </span>
                    )}
                  </div>

                  {/* Verification Code Input */}
                  {smsSent && !isPhoneVerified && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="인증번호 6자리"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-sky-400/70 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                        disabled={loading || verifyingCode}
                      />
                      <button
                        type="button"
                        onClick={verifySmsCode}
                        disabled={verifyingCode || !verificationCode.trim()}
                        className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white/90 active:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {verifyingCode ? "확인 중..." : "확인"}
                      </button>
                    </div>
                  )}

                  {/* SMS Message Display */}
                  {smsMessage && (
                    <p className={`mt-2 text-xs font-medium ${smsMessage.isError ? "text-rose-400" : "text-emerald-400"}`}>
                      {smsMessage.text}
                    </p>
                  )}
                </div>

                {/* Email Field */}
                <div>
                  <label className="mb-1 block text-sm font-semibold text-white/80">
                    이메일 주소 <span className="font-normal text-white/40">(선택)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                    }}
                    placeholder="user@example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-sky-400/70 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                    disabled={loading}
                  />
                </div>

                {/* Validate Button */}
                <button
                  type="submit"
                  className="mt-2 w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_10px_30px_rgba(56,132,255,0.4)] transition-all hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:from-white/15 disabled:to-white/15 disabled:text-white/40 disabled:shadow-none"
                  disabled={loading || !isPhoneVerified}
                >
                  {loading ? "기기 검증 중..." : "구매 하기"}
                </button>
              </form>

              {/* Status Message Display */}
              {errorMessage && (
                <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-xs leading-normal text-rose-200">
                  ⚠️ {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-xs leading-normal text-emerald-200">
                  ✓ {successMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Full product detail image ===== */}
        <section className="flex flex-col items-center">
          <p className="mb-5 text-xs font-semibold tracking-[0.25em] text-sky-300/80">
            PRODUCT DETAIL
          </p>
          <div className="w-full max-w-[480px] overflow-hidden rounded-3xl border border-white/10 shadow-[0_24px_70px_rgba(2,10,40,0.5)]">
            <img
              src="/images/iot-pass-detail.png"
              alt="Aqara L100 SE 전용 IoT Pass 상세 안내"
              className="w-full"
            />
          </div>
        </section>
      </main>

      {/* Mobile floating "구매하기" jump button */}
      <a
        href="#purchase-form"
        aria-hidden={!showJumpBtn}
        className={`fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-gradient-to-r from-sky-500 to-cyan-400 px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(56,132,255,0.5)] backdrop-blur-md transition-all duration-300 active:scale-95 md:hidden ${
          showJumpBtn ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        구매하기
      </a>

      {/* SN Location Guide Modal */}
      {snHelpOpen && <SnLocationModal onClose={() => setSnHelpOpen(false)} />}

      {/* Camera QR Scanning Modal */}
      {isScanning && (
        <QrScanModal
          title="기기 일련번호 QR 스캔"
          onClose={() => setIsScanning(false)}
          onResult={(resultSn) => {
            setSn(resultSn);
            setIsScanning(false);
            setSuccessMessage("");
            setErrorMessage("");
          }}
        />
      )}
    </div>
  );
}
