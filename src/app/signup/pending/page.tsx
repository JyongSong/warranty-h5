import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { canViewBackoffice } from "@/lib/login/backofficeRoles";
import PendingSignOutButton from "./PendingSignOutButton";

export const dynamic = "force-dynamic";

export default async function BackofficeSignupPendingPage() {
  const user = await getCurrentBackofficeUser();
  if (!user) redirect("/login");
  // 승인됐으면 이 화면에 머물 이유가 없다.
  if (canViewBackoffice(user.level)) redirect("/backoffice");

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <div className="mx-auto w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">승인 대기 중</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          <span className="font-medium text-zinc-900">{user.email}</span> 계정은 아직 관리자 승인 전입니다.
          승인되면 백오피스를 이용할 수 있습니다.
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            href="/backoffice"
            className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white"
          >
            승인 여부 다시 확인
          </Link>
          <PendingSignOutButton />
        </div>
      </div>
    </div>
  );
}
