import type { ReactNode } from "react";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import BackofficeDesktopSidebar from "./BackofficeDesktopSidebar";
import BackofficeMobileNav from "./BackofficeMobileNav";

export default async function BackofficeLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const user = await getCurrentBackofficeUser();

  return (
    <div className="min-h-screen bg-white text-zinc-950 md:h-screen md:overflow-hidden">
      <BackofficeMobileNav userEmail={user?.email} />
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-full md:min-h-0 md:flex-row">
        <BackofficeDesktopSidebar userEmail={user?.email} />

        <main className="flex min-w-0 flex-1 overflow-hidden md:min-h-0">
          <div className="min-w-0 flex-1 overflow-x-auto md:overflow-y-auto">{children}</div>
          {detail}
        </main>
      </div>
    </div>
  );
}
