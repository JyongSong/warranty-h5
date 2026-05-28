"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CHAPTERS, pad2 } from "./chapters";

type MainTabId = "promo" | "slides";
type PromoTabId = "basic" | "wallpad" | "package" | "complete";

// sticky 점프바 라벨 (상세 설치 가이드용)
const NAV_LABELS: Record<string, string> = {
  ch1: "1. 도어락 등록",
  ch2: "2. 허브 등록",
  ch3: "3. 도어락 + 허브 연결",
};

export default function InstallGuidePage() {
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("promo");
  const [activePromoTab, setActivePromoTab] = useState<PromoTabId>("basic");

  const navigateToChapter = (chapterId: string) => {
    setActiveMainTab("slides");
    setTimeout(() => {
      const el = document.getElementById(chapterId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const mainTabs = [
    { id: "promo", label: "프로모션 서비스 안내" },
    { id: "slides", label: "상세 설치 가이드 (이미지)" },
  ] as const;

  const promoTabs = [
    { id: "basic", label: "기본 설치 & 앱" },
    { id: "wallpad", label: "월패드 연동" },
    { id: "package", label: "M200+W100 패키지" },
    { id: "complete", label: "완료 등록 & 문의" },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-900 flex justify-center items-start">
      {/* 모바일 H5 화면 에뮬레이션 컨테이너 */}
      <div className="w-full max-w-[480px] min-h-screen bg-zinc-50 flex flex-col shadow-2xl relative">
        
        {/* 헤더 */}
        <header className="bg-[#1d3129] text-white p-6 rounded-b-[2rem] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8" />
          
          <div className="relative z-10">
            <span className="inline-block bg-white/10 border border-white/20 text-white/90 text-[10px] font-bold tracking-[0.15em] px-3 py-1 rounded-full uppercase mb-3">
              INSTALLER GUIDE PORTAL
            </span>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">
              아카라 도어락 프로모션 설치 서비스 안내
            </h1>
            <p className="text-xs text-white/70 mt-1 font-medium">
              Aqara Smart Home Installer Portal
            </p>
          </div>
        </header>

        {/* 1차 분류 탭 (최상단 고정) */}
        <nav className="sticky top-0 z-30 bg-[#1d3129] border-t border-white/10 px-4 py-2.5 flex gap-2 shadow-md">
          {mainTabs.map((tab) => {
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer text-center ${
                  isActive
                    ? "bg-white text-[#1d3129] shadow-sm"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* 2차 콘텐츠 렌더링 */}
        <main className="flex-1 flex flex-col">

          {/* TAB A: 프로모션 서비스 안내 */}
          {activeMainTab === "promo" && (
            <div className="flex-1 flex flex-col animate-fadeIn">
              
              {/* 2차 서브 탭 */}
              <div className="bg-white border-b border-zinc-200 flex gap-2 p-3 overflow-x-auto scrollbar-none sticky top-[49px] z-20 shadow-sm">
                {promoTabs.map((tab) => {
                  const isActive = activePromoTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActivePromoTab(tab.id)}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-[#1d3129] text-white shadow-sm border border-[#1d3129]"
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border border-zinc-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 탭 콘텐츠 바디 */}
              <div className="p-4 space-y-6 flex-1">
                
                {/* 2.1. 기본 설치 & 앱 */}
                {activePromoTab === "basic" && (
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* 기본 설치 범위 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                        <h2 className="text-base font-bold text-zinc-800">1. 기본 설치 범위</h2>
                      </div>
                      <ul className="space-y-3 text-xs leading-relaxed text-zinc-600">
                        <li className="flex items-start gap-2.5">
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-400 mt-1.5" />
                          <span>
                            설치 기사님은 <strong>도어락 설치와 함께 앱 설치를 진행</strong>해야 합니다.
                            <span className="block text-zinc-400 mt-0.5">(단, 고객이 생략을 요청한 경우에는 제외)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-400 mt-1.5" />
                          <span>
                            <strong>L100 패키지 상품</strong>은 <strong>M200 허브 연동</strong>까지 진행해야 합니다.
                            <span className="text-[#1d3129] font-bold block mt-1">
                              ※ 온습도 스위치 W100 등록은 매뉴얼에 따라 직접 진행하도록 고객에게 안내해 주세요.
                            </span>
                            <span className="block text-zinc-400 mt-0.5">(단, 고객이 생략을 요청한 경우에는 제외)</span>
                          </span>
                        </li>
                      </ul>

                      {/* 추가 설치비 지급 안내 */}
                      <div className="mt-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-3 text-xs">
                        <div className="font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[#1d3129] font-mono">🎁</span>
                          <span>앱 등록 추가 설치비 지급</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-sm flex flex-col justify-center">
                            <span className="text-zinc-500 block text-[10px] mb-0.5">도어락 Aqara Home 앱 등록 시</span>
                            <span className="font-bold text-[#1d3129] text-[13px]">+5,000원 추가 지급</span>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-sm flex flex-col justify-center">
                            <span className="text-zinc-500 block text-[10px] mb-0.5">도어락 허브(M200) 등록 시</span>
                            <span className="font-bold text-[#1d3129] text-[13px]">+20,000원 추가 지급</span>
                          </div>
                        </div>

                        <div className="space-y-2 text-zinc-600 text-[11px] leading-relaxed">
                          <p className="font-semibold text-zinc-700">
                            ✓ 증빙 방법:
                          </p>
                          <p className="pl-3.5 relative">
                            <span className="absolute left-1 top-1.5 w-1 h-1 rounded-full bg-zinc-400" />
                            Aqara Home 앱 내 도어락 화면을 사진으로 촬영하여 이카운트에 업로드해 주시면 증빙으로 인정됩니다.
                          </p>
                          
                          {/* 증빙 화면 예시 이미지 */}
                          <div className="bg-white p-2 rounded-xl border border-zinc-200 shadow-sm overflow-hidden mt-1 max-w-[200px] mx-auto">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/promo-guide/proof-app.png"
                              alt="Aqara Home 앱 내 도어락 증빙 화면 예시"
                              className="w-full h-auto rounded object-contain"
                            />
                            <p className="text-[9px] text-zinc-400 text-center mt-1">
                              [증빙 화면 예시]
                            </p>
                          </div>

                          <p className="text-zinc-400 font-medium leading-relaxed mt-2 text-[10.5px]">
                            ※ 단, 현장 여건상 진행이 어렵거나 인터넷 연결이 불가한 경우, 집주인이 현장에 없는 경우, 또는 고객님이 원하지 않는 경우에는 기본 설치만 진행해 주시면 됩니다.
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* 도어락 및 앱 설치 가이드 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                          <h2 className="text-base font-bold text-zinc-800">2. 도어락 및 앱 설치</h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigateToChapter("ch1")}
                          className="text-xs text-[#1d3129] hover:text-[#16251f] font-extrabold hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          가이드 보기
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      </div>

                      {/* (1) 설치 전 고객 안내 */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">2.1</span>
                          설치 전 고객 안내
                        </h3>
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/50 text-xs text-zinc-600 leading-relaxed">
                          설치 전에 고객에게 본인 휴대폰에 <strong>‘아카라홈 앱’</strong>을 설치 및 회원 가입하도록 안내해 주세요.
                        </div>
                      </div>

                      {/* (2) 설치 진행 순서 */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">2.2</span>
                          설치 진행 순서
                        </h3>
                        <ol className="relative border-l border-zinc-200 ml-2.5 pl-4 space-y-3.5 text-xs text-zinc-600">
                          <li className="relative">
                            <span className="absolute -left-[21px] top-0.5 flex items-center justify-center w-3 h-3 bg-zinc-300 rounded-full border-2 border-white ring-2 ring-zinc-100" />
                            <span className="font-semibold text-zinc-700">고객 앱 설치 및 회원가입 안내</span>
                          </li>
                          <li className="relative">
                            <span className="absolute -left-[21px] top-0.5 flex items-center justify-center w-3 h-3 bg-zinc-300 rounded-full border-2 border-white ring-2 ring-zinc-100" />
                            <span className="font-semibold text-zinc-700">도어락 설치 진행</span>
                          </li>
                          <li className="relative">
                            <span className="absolute -left-[21px] top-0.5 flex items-center justify-center w-3 h-3 bg-zinc-300 rounded-full border-2 border-white ring-2 ring-zinc-100" />
                            <span className="font-semibold text-zinc-700">설치 완료 후 문 상태 및 동작 이상 여부 점검</span>
                          </li>
                          <li className="relative">
                            <span className="absolute -left-[21px] top-0.5 flex items-center justify-center w-3 h-3 bg-[#1d3129] rounded-full border-2 border-white ring-2 ring-[#1d3129]/20" />
                            <span className="font-semibold text-[#1d3129]">이상 없을 경우 고객 휴대폰으로 도어락등록</span>
                            <div className="mt-1 text-[11px] text-zinc-500 bg-zinc-100/50 p-2 rounded-lg">
                              사용자 비밀번호 등록, 지문 등록 진행
                            </div>
                          </li>
                        </ol>
                      </div>

                      {/* (3) 기본 사용자 등록 기준 */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">2.3</span>
                          기본 사용자 등록 기준 <span className="text-[10px] font-normal text-zinc-400">(필수)</span>
                        </h3>
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200/50 space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-center text-xs">
                            <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-sm">
                              <span className="text-zinc-400 block mb-0.5">비밀번호</span>
                              <span className="font-bold text-[#1d3129]">1개</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-zinc-100 shadow-sm">
                              <span className="text-zinc-400 block mb-0.5">지문</span>
                              <span className="font-bold text-[#1d3129]">1개</span>
                              <span className="text-[9px] text-zinc-400 block">(동일인 기준)</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-400 text-center">
                            ※ 고객 요청 시 추가 등록
                          </p>
                        </div>
                      </div>

                      {/* (4) 필수 동작 테스트 */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">2.4</span>
                          필수 동작 테스트 리스트
                        </h3>
                        <div className="bg-[#1d3129]/5 p-4 rounded-xl border border-[#1d3129]/10 space-y-2 text-xs text-zinc-700">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-[#1d3129] rounded-full" />
                            <span>비밀번호로 열기 테스트</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-[#1d3129] rounded-full" />
                            <span>지문으로 열기 테스트</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-[#1d3129] rounded-full" />
                            <span>아카라 앱의 <strong>잠금해제 메뉴</strong>로 열기 테스트</span>
                          </div>
                        </div>
                      </div>

                    </section>
                  </div>
                )}

                {/* 2.2. 월패드 연동 */}
                {activePromoTab === "wallpad" && (
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* 월패드 연동 가이드 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                        <h2 className="text-base font-bold text-zinc-800">3. 월패드 연동 가이드</h2>
                      </div>

                      {/* (1) 고객 사용 여부 확인 */}
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">3.1</span>
                          고객 사용 여부 및 사전 안내
                        </h3>
                        <p className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-200/50">
                          도어락 및 앱 설치 완료 후 고객에게 월패드 사용 여부를 확인합니다.
                          <strong className="block text-[#1d3129] mt-1 font-semibold">※ 월패드 연동 시 발생하는 비용을 사전에 안내해 주세요.</strong>
                        </p>
                      </div>

                      {/* (2) 연동 가능 여부 확인 */}
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">3.2</span>
                          연동 가능 여부 체크
                        </h3>
                        <p className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-200/50">
                          고객 월패드 모델을 확인하여 연동 가능 여부를 체크합니다.
                          <span className="block text-zinc-400 mt-1 font-medium">※ 월패드가 지나치게 노후된 경우, 점검 과정에서도 손상 또는 고장이 발생할 수 있음을 사전에 안내해 주세요.</span>
                        </p>
                      </div>

                      {/* (3) 노후 월패드 관련 안내 (경고 카드) */}
                      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                          <span>⚠️ 3.3 노후 월패드 사전 고지 (필수)</span>
                        </div>
                        <p className="text-xs text-amber-700 leading-relaxed font-medium">
                          <strong>노후 월패드</strong>는 점검 또는 설치 과정 중 고장이 발생할 수 있습니다.
                        </p>
                        <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
                          해당 경우 설치 기사님 책임이 아님을 반드시 사전에 고객에게 안내하고 양해를 받아 주세요.
                        </p>
                      </div>

                      {/* (4) 비용 안내 기준 */}
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">3.4</span>
                          비용 안내 기준
                        </h3>
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200/50 space-y-3">
                          <p className="text-xs text-zinc-600 leading-relaxed">
                            연동 가능 확인 후 월패드 연동기 및 설치 비용을 고객에게 안내합니다.
                          </p>
                          <div className="bg-white p-3 rounded-lg border border-zinc-200/60 shadow-sm flex flex-col items-center justify-center">
                            <span className="text-[10px] text-zinc-400 font-bold block">고객과 비용 협의가 어려운 경우</span>
                            <span className="text-sm font-extrabold text-[#992222] mt-1 text-center">
                              반드시 본사 담당자 확인 후<br />고객 안내 진행
                            </span>
                          </div>
                        </div>
                      </div>

                    </section>
                  </div>
                )}

                {/* 2.3. M200 + W100 패키지 */}
                {activePromoTab === "package" && (
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* 패키지 설치 가이드 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                        <h2 className="text-base font-bold text-zinc-800">4. M200 + W100 포함 패키지</h2>
                      </div>

                      {/* (1) 고객 휴대폰 사용 안내 */}
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">4.1</span>
                          고객 휴대폰 사용 동의
                        </h3>
                        <p className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-200/50">
                          설치 과정 중 <strong>고객 휴대폰 사용에 대한 동의</strong>를 먼저 받아 주세요.
                          <span className="block text-zinc-400 mt-1 font-medium">※ 고객이 원하지 않을 경우 상세페이지 내 설치 영상을 참고하여 직접 설정 가능함을 안내해 주세요.</span>
                        </p>
                      </div>

                      {/* (2) M200 허브 연결 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">4.2</span>
                            M200 허브 연결
                          </h3>
                          <button
                            type="button"
                            onClick={() => navigateToChapter("ch2")}
                            className="text-[10px] text-[#1d3129] hover:text-[#16251f] font-extrabold hover:underline cursor-pointer flex items-center gap-0.5"
                          >
                            가이드 보기
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        </div>
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/50 text-xs text-zinc-600 space-y-1">
                          <p>• M200 허브 전원을 연결합니다.</p>
                          <p>• 고객 무선공유기 <strong>Wi-Fi(2.4GHz 또는 5GHz)</strong>에 연결합니다.</p>
                        </div>
                      </div>

                      {/* (3) 원격 잠금해제 확인 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">4.3</span>
                            원격 잠금해제 확인
                          </h3>
                          <button
                            type="button"
                            onClick={() => navigateToChapter("ch3")}
                            className="text-[10px] text-[#1d3129] hover:text-[#16251f] font-extrabold hover:underline cursor-pointer flex items-center gap-0.5"
                          >
                            가이드 보기
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        </div>
                        <ol className="list-decimal list-inside text-xs text-zinc-600 space-y-1.5 bg-zinc-50 p-3 rounded-xl border border-zinc-200/50 pl-4">
                          <li>M200 허브에 도어락을 연결한 후 도어락의 <strong>&quot;원격 잠금 해제&quot; 기능을 켜주세요</strong>.</li>
                          <li>고객 휴대폰의 <strong>블루투스를 잠시 꺼주세요</strong>.</li>
                          <li>아카라 앱에서 원격 잠금해제 동작을 확인해 주세요.</li>
                        </ol>
                      </div>

                      {/* (4) W100 등록 안내 */}
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">4.4</span>
                          온습도 스위치 W100 등록 안내
                        </h3>
                        <p className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-200/50 font-medium">
                          온습도 스위치 W100 등록은 매뉴얼에 따라 직접 진행하도록 고객에게 안내해 주세요.
                        </p>
                      </div>

                    </section>
                  </div>
                )}

                {/* 2.4. 완료 등록 & 문의 */}
                {activePromoTab === "complete" && (
                  <div className="space-y-6 animate-fadeIn">
                    
                    {/* 설치 완료 후 필수 진행 사항 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                        <h2 className="text-base font-bold text-zinc-800">5. 설치 완료 후 필수 진행</h2>
                      </div>

                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200/50 space-y-3.5 text-xs text-zinc-600 leading-relaxed">
                        <div className="space-y-1">
                          <p className="font-semibold text-zinc-800">
                            제품 패키지에 부착된 스티커를 통해 반드시 <span className="text-[#1d3129] font-bold underline">‘2년 무상 A/S 등록’</span>을 진행해 주세요. <span className="text-zinc-500 font-medium">(소요시간: 약 1분)</span>
                          </p>
                          <p className="text-[11px] text-[#1d3129] font-bold leading-relaxed">
                            ※ 5/28부터 출고되는 K100/L100 도어락은 &apos;제품 정보 등록 안내&apos; 스티커가 부착되어 출고됩니다.
                          </p>
                        </div>
                        
                        <div className="h-px bg-zinc-200" />
                        
                        <ul className="space-y-2.5">
                          <li className="flex items-start gap-2">
                            <span className="text-[#1d3129] font-bold font-mono">✓</span>
                            <span>설치 등록은 <strong>기사님 휴대폰 또는 고객 휴대폰</strong> 모두 사용 가능합니다.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-[#1d3129] font-bold font-mono">✓</span>
                            <span>고객 연락처, 설치일자 및 기사님 전화번호를 정확히 입력해 주세요.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-[#1d3129] font-bold font-mono">✓</span>
                            <span>등록 완료 후 <strong>기사님 휴대폰으로 확인 링크 문자</strong>가 발송되며, 링크를 열어 확인 버튼을 누르셔야 최종 완료됩니다.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-[#1d3129] font-bold font-mono">✓</span>
                            <span>설치 완료 체크 항목을 모두 최종 확인하여 등록을 완료하고 서비스를 종료합니다.</span>
                          </li>
                        </ul>
                      </div>

                      {/* 제품 등록 안내 스티커 이미지 */}
                      <div className="bg-white p-3 rounded-2xl border border-zinc-200/50 overflow-hidden shadow-sm space-y-2">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                          제품 정보 등록 안내 스티커 위치
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/promo-guide/product-box.png"
                          alt="L100, K100 제품 정보 등록 안내 스티커 위치"
                          className="w-full h-auto rounded-lg object-contain"
                        />
                        <p className="text-[10px] text-zinc-400 text-center font-medium">
                          L100 및 K100 패키지 박스 부착 예시
                        </p>
                      </div>

                      {/* 설치등록 바로가기 버튼 */}
                      <Link
                        href="/reg"
                        className="w-full py-3.5 bg-[#1d3129] hover:bg-[#16251f] active:scale-[0.99] text-white font-bold rounded-xl text-center shadow-md hover:shadow-lg transition-all duration-200 block text-xs"
                      >
                        설치 등록 페이지 미리보기
                      </Link>
                    </section>

                    {/* 기술 문의 연락처 */}
                    <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-5 bg-[#1d3129] rounded-full" />
                        <h2 className="text-base font-bold text-zinc-800">6. 기술 문의 연락처</h2>
                      </div>
                      
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        기술 문의가 필요한 경우 아래 담당자에게 연락 바랍니다.
                      </p>

                      <div className="space-y-2.5">
                        <a
                          href="tel:010-9170-3550"
                          className="flex items-center justify-between p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-zinc-100 active:scale-[0.98] transition-all duration-200"
                        >
                          <div className="text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">1차 담당자</span>
                            <span className="text-xs font-bold text-zinc-800">송지용 (010-9170-3550)</span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-[#1d3129]/10 flex items-center justify-center text-[#1d3129]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.387a12.035 12.035 0 01-7.108-7.108c-.158-.44.008-.927.387-1.21l1.293-.97c.361-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                            </svg>
                          </div>
                        </a>

                        <a
                          href="tel:010-7612-9632"
                          className="flex items-center justify-between p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-zinc-100 active:scale-[0.98] transition-all duration-200"
                        >
                          <div className="text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">2차 담당자</span>
                            <span className="text-xs font-bold text-zinc-800">김지윤 (010-7612-9632)</span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-[#1d3129]/10 flex items-center justify-center text-[#1d3129]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.387a12.035 12.035 0 01-7.108-7.108c-.158-.44.008-.927.387-1.21l1.293-.97c.361-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                            </svg>
                          </div>
                        </a>
                      </div>
                    </section>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* TAB B: 상세 설치 가이드 (이미지) */}
          {activeMainTab === "slides" && (
            <div className="flex-1 flex flex-col animate-fadeIn">
              
              {/* 챕터 점프 네비게이션바 (Sticky) */}
              <div className="sticky top-[49px] z-20 bg-[#1d3129] border-b border-white/5 flex gap-2 p-3 overflow-x-auto scrollbar-none shadow-sm">
                {CHAPTERS.map((ch) => (
                  <a
                    key={ch.id}
                    href={`#${ch.id}`}
                    className="flex-shrink-0 bg-white/10 text-white/90 hover:bg-white/15 border border-white/10 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200"
                  >
                    {NAV_LABELS[ch.id] ?? ch.title}
                  </a>
                ))}
              </div>

              {/* 슬라이드 콘텐츠 리스트 */}
              <div className="p-4 space-y-10">
                {CHAPTERS.map((ch) => (
                  <section key={ch.id} id={ch.id} className="scroll-mt-32 space-y-4">
                    <div className="flex flex-col gap-1.5 border-b border-zinc-200 pb-3">
                      <span className="inline-block self-start text-[10px] font-extrabold tracking-widest text-white px-2 py-0.5 rounded bg-[#1d3129]">
                        CHAPTER {ch.number}
                      </span>
                      <h2 className="text-lg font-extrabold text-zinc-800">{ch.title}</h2>
                      {ch.stepCount && (
                        <p className="text-xs text-zinc-400 font-medium">{ch.stepCount} 단계</p>
                      )}
                    </div>

                    <div className="space-y-4">
                      {ch.slides.map((n) => (
                        <figure key={n} id={`slide-${n}`} className="margin-0 bg-white border border-zinc-100 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/install-guide/slide-${pad2(n)}.jpg`}
                            alt={`${ch.title} 슬라이드 ${n}`}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-auto block"
                          />
                        </figure>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

            </div>
          )}

        </main>

        {/* 공통 푸터 */}
        <footer className="text-center py-6 px-4 text-[10px] text-zinc-400 bg-zinc-100 border-t border-zinc-200 mt-auto">
          <p>© 2026 Aqara Smart Home Guide. All Rights Reserved.</p>
        </footer>

      </div>

      {/* 애니메이션 및 스타일 태그 */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out forwards;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
