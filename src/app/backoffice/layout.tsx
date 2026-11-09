import type { ReactNode } from "react";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { canEditBackoffice } from "@/lib/login/backofficeRoles";
import BackofficeAttentionAlert from "./BackofficeAttentionAlert";
import BackofficeDesktopSidebar from "./BackofficeDesktopSidebar";
import BackofficeMobileNav from "./BackofficeMobileNav";
import BackofficeNavigationFeedback from "./BackofficeNavigationFeedback";

export default async function BackofficeLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const user = await requireBackofficeUserPage("/backoffice");

  return (
    <div className="min-h-screen bg-white text-zinc-950 md:h-screen md:overflow-hidden">
      <BackofficeNavigationFeedback />
      <BackofficeAttentionAlert />
      <BackofficeMobileNav userEmail={user.email} userLevel={user.level} />
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-full md:min-h-0 md:flex-row">
        <BackofficeDesktopSidebar userEmail={user.email} userLevel={user.level} />

        <main className="flex min-w-0 flex-1 overflow-hidden md:min-h-0">
          <div className="min-w-0 flex-1 overflow-x-auto md:overflow-y-auto">
            {canEditBackoffice(user.level) ? null : (
              <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-medium text-amber-800 lg:px-8">
                조회 전용 계정입니다. 데이터 수정과 문자 발송은 할 수 없습니다.
              </div>
            )}
            {children}
          </div>
          {detail}
        </main>
      </div>
    </div>
  );
}
