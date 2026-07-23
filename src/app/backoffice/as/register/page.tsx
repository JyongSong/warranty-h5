import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";

export default async function AsRegisterPage() {
  await requireBackofficeUserPage("/backoffice/as/register");

  return (
    <div className="p-6">
      <div className="max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-950">A/S 등록 준비 중</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          이 기능은 현재 준비 중입니다. 백오피스 통합 후 업데이트될 예정입니다.
        </p>
      </div>
    </div>
  );
}
