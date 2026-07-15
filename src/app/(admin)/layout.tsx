import type { ReactNode } from "react";
import PortalSidebar from "./_components/PortalSidebar";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { redirect } from "next/navigation";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentBackofficeUser();

  // Centralized portal security check: Require Supabase Auth & Level >= 1
  if (!user || user.level < 1) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-950 md:flex-row flex-col">
      {/* System Sidebar */}
      <PortalSidebar userEmail={user.email} />

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 bg-zinc-50/50">
        <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
