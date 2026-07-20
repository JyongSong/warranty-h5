"use client";

import { useState, useEffect } from "react";
import QrScanModal from "@/app/reg/QrScanModal";
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f1ea_0%,#fbfaf8_55%,#ffffff_100%)] text-zinc-900 font-sans">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12 sm:px-10">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            ← 메인으로 돌아가기
          </a>
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
              
              <div className="mt-8 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-sky-600 mb-3">구매 후 사용 가능한 주요 기능</h3>
                  <ul className="list-disc list-inside text-sm leading-relaxed text-zinc-700 space-y-1.5 marker:text-zinc-400">
                    <li>스마트 자동화</li>
                    <li>원격 잠금 해제</li>
                    <li>원격 도어락 상태 확인</li>
                    <li>원격 도어락 알림 수신</li>
                    <li>Aqara 카메라 및 도어벨과의 기기 연동</li>
                    <li>Google Home 등 타사 플랫폼 연동</li>
                  </ul>
                  <p className="mt-3 text-sm font-semibold text-zinc-800">
                    ※ L100 SE는 기능 업그레이드 후에도 SmartThings를 지원하지 않습니다.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-sky-600 mb-3">필수 안내사항</h3>
                  <ul className="list-disc list-inside text-sm leading-relaxed text-zinc-700 space-y-1.5 marker:text-zinc-400">
                    <li>본 상품은 L100 SE의 Aqara Hub 연결 기능을 활성화하는 유상 업그레이드 상품입니다.</li>
                    <li>상기 기능은 업그레이드 구매 후 Aqara Hub를 연결해야 사용할 수 있습니다.</li>
                    <li>기능 업그레이드는 계정이 아닌 해당 도어락의 제품 SN을 기준으로 적용되며, 기기를 양도하거나 계정을 변경해도 업그레이드 권한은 해당 기기에 유지됩니다.</li>
                    <li>구매 전 대상 제품이 L100 SE인지 확인해야 합니다.</li>
                    <li>이미 업그레이드가 완료된 제품은 중복 구매할 수 없습니다.</li>
                    <li>L100 SE는 SmartThings를 지원하지 않습니다.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Price Box */}
            <div className="mt-8 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-6 text-white shadow-lg">
              <span className="text-xs font-medium text-zinc-400">업그레이드 금액</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold">₩</span>
                <span className="text-4xl font-extrabold tracking-tight">99,000</span>
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
                    }}
                    placeholder="예: 홍길동"
                    className="w-full rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Phone Field with SMS Verification */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">
                    휴대폰 번호
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="예: 010-1234-5678"
                      className="flex-1 min-w-0 rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors disabled:bg-zinc-100 disabled:text-zinc-500"
                      required
                      disabled={loading || isPhoneVerified}
                    />
                    {!isPhoneVerified && (
                      <button
                        type="button"
                        onClick={sendSmsCode}
                        disabled={sendingSms || normalizePhone(phone).length < 9 || smsTimer > 0}
                        className="shrink-0 rounded-xl border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingSms ? "발송 중..." : smsTimer > 0 ? `${smsTimer}초` : "인증번호 발송"}
                      </button>
                    )}
                  </div>
                  
                  {/* Verification Code Input */}
                  {smsSent && !isPhoneVerified && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="인증번호 6자리"
                        className="flex-1 min-w-0 rounded-xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none transition-colors"
                        disabled={loading || verifyingCode}
                      />
                      <button
                        type="button"
                        onClick={verifySmsCode}
                        disabled={verifyingCode || !verificationCode.trim()}
                        className="shrink-0 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-900 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyingCode ? "확인 중..." : "확인"}
                      </button>
                    </div>
                  )}

                  {/* SMS Message Display */}
                  {smsMessage && (
                    <p className={`mt-2 text-xs font-medium ${smsMessage.isError ? "text-rose-600" : "text-emerald-600"}`}>
                      {smsMessage.text}
                    </p>
                  )}
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
                  disabled={loading || !isPhoneVerified}
                >
                  {loading ? "기기 검증 중..." : "구매 하기"}
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
            setSuccessMessage("");
            setErrorMessage("");
          }}
        />
      )}
    </div>
  );
}
