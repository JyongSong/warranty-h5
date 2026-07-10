import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import BackofficeMobileNav from "./BackofficeMobileNav";
import BackofficeSidebarNav from "./BackofficeSidebarNav";
import BackofficeUserMenu from "./BackofficeUserMenu";

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentBackofficeUser();

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <BackofficeMobileNav userEmail={user?.email} />
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:min-h-screen md:flex-row">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
          <div className="border-b border-slate-200 bg-white px-5 py-5">
            <h1>
              <Link href="/backoffice" className="block text-sm font-semibold text-slate-950">
                <span className="block text-[15px] leading-5">Backoffice</span>
              </Link>
            </h1>
            {user ? (
              <div className="mt-4 min-w-0">
                <BackofficeUserMenu email={user.email} />
              </div>
            ) : null}
          </div>

          <BackofficeSidebarNav />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
