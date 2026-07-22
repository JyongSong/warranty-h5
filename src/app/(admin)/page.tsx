import { requirePortalUserPage } from "@/lib/adminAuth";

export default async function AdminDashboardPage() {
  // Enforce login
  await requirePortalUserPage("/");

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-3xl border border-zinc-200/80 bg-white p-10 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-md">
        <div className="mb-6 flex justify-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Welcome
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          Aqara 설치/보증 관리 통합 포털에 오신 것을 환영합니다.<br />
          왼쪽 사이드바 메뉴를 사용하여 업무를 시작하세요.
        </p>
      </div>
    </div>
  );
}
