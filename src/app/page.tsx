export default function Home() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f1ea_0%,#fbfaf8_55%,#ffffff_100%)] text-zinc-900">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-12 px-6 py-16 sm:px-10">
        <div className="max-w-3xl space-y-6">
          <p className="inline-flex rounded-full border border-black/10 bg-white/70 px-4 py-1 text-sm font-medium tracking-[0.18em] text-zinc-600 uppercase">
            Warranty Portal
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Aqara 설치 등록 및 설치 확인
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
            이 프로젝트는 도어락 출고 검증, 설치 등록, 확인 링크 발송, 그리고 A/S 기간 산정을 위한 업무용 포털입니다. 현재 데이터 계층은 Prisma + MySQL로 통합되어 있습니다.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <a
            className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-1"
            href="/reg"
          >
            <div className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Register
            </div>
            <div className="mb-2 text-2xl font-semibold">설치 등록</div>
            <p className="text-sm leading-6 text-zinc-600">
              SN, 설치일, 연락처를 입력하고 설치 확인 절차를 시작합니다.
            </p>
          </a>
          <a
            className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-1"
            href="/confirm"
          >
            <div className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Confirm
            </div>
            <div className="mb-2 text-2xl font-semibold">설치 확인</div>
            <p className="text-sm leading-6 text-zinc-600">
              설치 기사님이 문자 링크로 접속해 설치 완료를 최종 확인합니다.
            </p>
          </a>
          <a
            className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-1"
            href="/privacy"
          >
            <div className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Privacy
            </div>
            <div className="mb-2 text-2xl font-semibold">개인정보 안내</div>
            <p className="text-sm leading-6 text-zinc-600">
              수집 항목, 이용 목적, 보관 기준 등 개인정보 관련 안내를 확인합니다.
            </p>
          </a>
          <a
            className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-1"
            href="/installers"
          >
            <div className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Installers
            </div>
            <div className="mb-2 text-2xl font-semibold">기사 관리</div>
            <p className="text-sm leading-6 text-zinc-600">
              기사 조회, 추가, 수정, 삭제와 설치 지표 관리를 한 페이지에서 처리합니다.
            </p>
          </a>
        </div>

        <div className="grid gap-6 rounded-[2rem] border border-black/10 bg-[#1d3129] px-6 py-8 text-white sm:grid-cols-3 sm:px-8">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] text-white/60">Stack</div>
            <div className="mt-2 text-lg font-semibold">Next.js 16 + Prisma 7</div>
          </div>
          <div>
            <div className="text-sm uppercase tracking-[0.18em] text-white/60">Database</div>
            <div className="mt-2 text-lg font-semibold">MySQL 8 / Docker Compose</div>
          </div>
          <div>
            <div className="text-sm uppercase tracking-[0.18em] text-white/60">SMS</div>
            <div className="mt-2 text-lg font-semibold">Mock / Twilio</div>
          </div>
        </div>
      </main>
    </div>
  );
}
