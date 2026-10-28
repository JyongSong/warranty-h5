import Link from "next/link";
import { partnerLogoutAction } from "../actions";

export default function PartnerHeader({
  partnerName,
  homeHref = "/partner/orders",
}: {
  partnerName: string;
  homeHref?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href={homeHref} className="text-base font-bold text-zinc-950">
          {partnerName} 설치 관리
        </Link>
        <form action={partnerLogoutAction}>
          <button type="submit" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
