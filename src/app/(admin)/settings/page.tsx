import { requirePortalUserPage } from "@/lib/adminAuth";
import Link from "next/link";

export default async function SettingsPage() {
  await requirePortalUserPage("/settings");

  const sections = [
    {
      title: "유저 관리",
      description: "백오피스 접속 관리자 계정을 추가, 수정, 관리합니다.",
      href: "/backoffice/settings/users",
    },
    {
      title: "시스템 설정",
      description: "자동 배정 활성화 상태 및 주요 운영 파라미터를 설정합니다.",
      href: "/backoffice/settings/system-settings",
    },
    {
      title: "시스템 상태",
      description: "백오피스 서비스 상태 및 배치 작업(Cron) 실행 결과를 모니터링합니다.",
      href: "/backoffice/settings/system-status",
    },
    {
      title: "SMS 템플릿",
      description: "고객 및 기사에게 발송되는 자동 SMS 알림톡 문구를 편집합니다.",
      href: "/backoffice/settings/sms-templates",
    },
    {
      title: "설치 기사 가져오기",
      description: "기사 엑셀 목록을 업로드하여 기사 DB를 대량 업데이트합니다.",
      href: "/backoffice/settings/data-import/installers",
    },
    {
      title: "매핑/라벨 확인",
      description: "ERP 연동 상품명 매핑 및 도어락 카테고리 태그 상태를 검증합니다.",
      href: "/backoffice/settings/json-entities",
    },
  ];

  return (
    <div className="px-6 py-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">설정 (Settings)</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            시스템 핵심 매개변수 설정 및 운영 데이터를 관리합니다.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group block rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
            >
              <h3 className="text-lg font-bold text-zinc-950 group-hover:text-emerald-700 transition-colors">
                {section.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {section.description}
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-zinc-700 group-hover:text-emerald-700">
                이동하기
                <svg className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
