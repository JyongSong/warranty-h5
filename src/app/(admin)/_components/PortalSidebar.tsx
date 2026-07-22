/* eslint-disable react-hooks/set-state-in-effect */
"use client";


import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type MenuItem = {
  href: string;
  label: string;
  newTab?: boolean;
  isActive?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

type MenuCategory = {
  label: string;
  icon: React.ReactNode;
  subItems?: MenuItem[];
  href?: string;
  newTab?: boolean;
  isActive?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

export default function PortalSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mobile sidebar state
  const [isOpen, setIsOpen] = useState(false);

  // Keep track of which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    주문: true,
    "A/S 관리": true,
    기사: true,
    "Open 패이지": true,
  });

  const toggleCategory = (label: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false);
    }
  }, [pathname, searchParams, isOpen]);


  // Define sidebar menu structure
  const categories: MenuCategory[] = [
    {
      label: "주문",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
      subItems: [
        {
          label: "주문대시보드",
          href: "/orders/dashboard",
        },
        {
          label: "ERP 주문 데이터",
          href: "/orders/erp",
        },
        {
          label: "설치 업무 큐",
          href: "/orders/queue",
        },
        {
          label: "설치 검색",
          href: "/orders/search",
        },
      ],
    },
    {
      label: "A/S 관리",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      subItems: [
        {
          label: "A/S등록",
          href: "/as/register",
        },
        {
          label: "A/S 검색",
          href: "/as/search",
        },
      ],
    },
    {
      label: "기사",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      subItems: [
        {
          label: "기사 관리 (installers)",
          href: "/installers",
        },
        {
          label: "기사 정산",
          href: "/installers/settlement",
        },
        {
          label: "기사 배정현황",
          href: "/installers/assignment-status",
        },
      ],
    },
    {
      label: "설치 정보 조회",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      href: "/registrations?tab=query",
      isActive: (path, params) => path === "/registrations" && params.get("tab") !== "survey",
    },
    {
      label: "만족도 조사 대시보드",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: "/registrations?tab=survey",
      isActive: (path, params) => path === "/registrations" && params.get("tab") === "survey",
    },
    {
      label: "기사배정 임시",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      href: "/dispatch",
    },
    {
      label: "설치 배정 SMS 임시",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
      href: "/send-assignment-sms",
    },
    {
      label: "Open 패이지",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      ),
      subItems: [
        {
          label: "기사 등록",
          href: "/survey",
          newTab: true,
        },
        {
          label: "설치 등록",
          href: "/reg",
          newTab: true,
        },
        {
          label: "BLE 업그레이드",
          href: "/ble_upgrade",
          newTab: true,
        },
      ],
    },
    {
      label: "설정",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: "/settings",
    },
  ];

  // Helper to check if a specific item is active
  const isItemActive = (item: MenuItem) => {
    if (item.isActive) {
      const searchParamsObj = new URLSearchParams(searchParams.toString());
      return item.isActive(pathname, searchParamsObj);
    }
    const cleanPath = pathname.split("?")[0];
    const cleanItemHref = item.href.split("?")[0];
    return cleanPath === cleanItemHref;
  };

  // Helper to check if a category has an active child
  const isCategoryActive = (category: MenuCategory) => {
    if (category.href) {
      if (category.isActive) {
        const searchParamsObj = new URLSearchParams(searchParams.toString());
        return category.isActive(pathname, searchParamsObj);
      }
      return pathname === category.href || pathname.startsWith(`${category.href}/`);
    }
    return category.subItems?.some(isItemActive) ?? false;
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      await fetch("/api/login/logout", { method: "POST" }).catch(() => null);
      window.location.assign("/login");
    }
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b border-zinc-900 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-extrabold text-white text-base">
            AQ
          </span>
          <span className="text-[15px] font-semibold uppercase tracking-wider">Aqaralife Service</span>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6" aria-label="메인 메뉴">
        {categories.map((category) => {
          const hasSubItems = Boolean(category.subItems?.length);
          const isExpanded = expandedCategories[category.label];
          const active = isCategoryActive(category);

          return (
            <div key={category.label} className="space-y-1">
              {hasSubItems ? (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.label)}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                      active
                        ? "text-white"
                        : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={active ? "text-emerald-500" : "text-zinc-500 group-hover:text-zinc-300"}>
                        {category.icon}
                      </span>
                      <span>{category.label}</span>
                    </div>
                    <svg
                      className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Nested Submenu */}
                  {isExpanded && (
                    <div className="ml-5 mt-1 border-l border-zinc-900 pl-4.5 space-y-1">
                      {category.subItems?.map((subItem) => {
                        const subActive = isItemActive(subItem);

                        return subItem.newTab ? (
                          <a
                            key={subItem.href}
                            href={subItem.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-900/40 hover:text-white transition-colors"
                          >
                            <span>{subItem.label}</span>
                            <svg className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`block rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                              subActive
                                ? "bg-zinc-900 text-emerald-400 font-bold"
                                : "text-zinc-500 hover:text-white"
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : category.newTab ? (
                <a
                  href={category.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold text-zinc-400 hover:bg-zinc-900/60 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 group-hover:text-zinc-300">{category.icon}</span>
                    <span>{category.label}</span>
                  </div>
                  <svg className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <Link
                  href={category.href || "#"}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-zinc-900 text-white font-bold"
                      : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                  }`}
                >
                  <span className={active ? "text-emerald-500" : "text-zinc-500 hover:text-zinc-300"}>
                    {category.icon}
                  </span>
                  <span>{category.label}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="border-t border-zinc-900 p-4">
        {userEmail && (
          <div className="mb-3 px-2 text-xs text-zinc-500 truncate" title={userEmail}>
            로그인 계정: <span className="font-semibold text-zinc-400">{userEmail}</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors border border-zinc-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          로그아웃
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="fixed inset-y-0 left-0 w-64 border-r border-zinc-900">
          {renderSidebarContent()}
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="flex h-14 w-full items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold text-zinc-950">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 font-extrabold text-white text-xs">
            AQ
          </span>
          <span className="text-sm tracking-wider uppercase">Aqaralife Service</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 active:scale-95 transition-all"
          aria-label="메뉴 열기"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Mobile Drawer Slide-over */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar drawer body */}
          <div className="relative flex w-64 max-w-xs flex-col animate-[slide-in-left_0.2s_ease-out]">
            {/* Close button inside drawer */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 z-10 rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              aria-label="메뉴 닫기"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="h-full flex-1">
              {renderSidebarContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
