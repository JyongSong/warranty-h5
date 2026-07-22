import Link from "next/link";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import HomeUserMenu from "./HomeUserMenu";

export default async function HomePage() {
  const user = await getCurrentBackofficeUser();
  const isLoggedIn = Boolean(user && user.level >= 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Background Radial Glow */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-teal-600/10 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                AQARALIFE SERVICE
              </span>
            </div>
          </Link>

          {/* User Auth Action */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <HomeUserMenu email={user!.email} />
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 text-xs font-semibold active:scale-95 transition-all"
              >
                <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                로그인
              </Link>
            )}
            <Link
              href="/backoffice"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-950/50 hover:from-emerald-400 hover:to-teal-400 active:scale-95 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              백오피스
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="py-20 text-center sm:py-28">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl max-w-4xl mx-auto leading-[1.15]">
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              AQARALIFE SERVICE
            </span>
          </h1>
        </section>

        {/* Section 1: 공개 서비스 (Public Services - No Login Required) */}
        <section id="public-services" className="py-12 border-t border-slate-800/60">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: 고객 설치 등록 */}
            <Link
              href="/reg"
              className="group relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all hover:-translate-y-1 shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                  이동하기 →
                </span>
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                설치 / 보증 등록 신청
              </h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                구매한 아카라 스마트홈 제품의 시리얼 번호 등록 및 정품 보증 신청 페이지입니다.
              </p>
            </Link>

            {/* Card 2: 기사 등록 신청 */}
            <Link
              href="/survey"
              className="group relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all hover:-translate-y-1 shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 group-hover:bg-teal-500 group-hover:text-slate-950 transition-colors">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-teal-400 group-hover:translate-x-1 transition-transform">
                  이동하기 →
                </span>
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
                신규 설치 기사 등록
              </h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                아카라 공식 설치 파트너 기사 지원 신청 및 설치 기사 정보 등록 폼입니다.
              </p>
            </Link>

            {/* Card 3: BLE 업그레이드 */}
            <Link
              href="/ble_upgrade"
              className="group relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all hover:-translate-y-1 shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
                  이동하기 →
                </span>
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                BLE 펌웨어 업그레이드
              </h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                도어락 및 스마트 디바이스의 최신 BLE 펌웨어 업데이트 및 진단 도구입니다.
              </p>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-400">AQARALIFE</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
