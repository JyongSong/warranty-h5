"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type MenuItem = {
  href: string;
  label: string;
  icon: "database" | "queue" | "search" | "settings" | "as" | "installer" | "query" | "survey" | "dashboard" | "orders" | "dispatch" | "sms";
  subItems?: MenuItem[];
};

const menuItems: MenuItem[] = [
  {
    href: "/backoffice/installation-dashboard",
    label: "주문",
    icon: "orders",
    subItems: [
      {
        href: "/backoffice/installation-dashboard",
        label: "주문 대시보드",
        icon: "dashboard",
      },
      {
        href: "/backoffice/installation-order-source",
        label: "ERP 주문 데이터",
        icon: "database",
      },
      {
        href: "/backoffice/installations?statusView=active",
        label: "설치 업무 큐",
        icon: "queue",
      },
      {
        href: "/backoffice/installation-search",
        label: "주문 검색",
        icon: "search",
      },
    ],
  },
  {
    href: "/backoffice/as/search",
    label: "A/S 관리",
    icon: "as",
    subItems: [
      {
        href: "/backoffice/as/register",
        label: "A/S등록",
        icon: "as",
      },
      {
        href: "/backoffice/as/search",
        label: "A/S 검색",
        icon: "as",
      },
    ],
  },
  {
    href: "/backoffice/installers",
    label: "기사",
    icon: "installer",
    subItems: [
      {
        href: "/backoffice/installers",
        label: "기사 관리",
        icon: "installer",
      },
      {
        href: "/backoffice/installers-settlement",
        label: "기사 정산",
        icon: "installer",
      },
      {
        href: "/backoffice/installers-assignment-status",
        label: "기사 배정현황",
        icon: "installer",
      },
    ],
  },
  {
    href: "/backoffice/registrations?tab=query",
    label: "설치 정보 조회",
    icon: "query",
  },
  {
    href: "/backoffice/registrations?tab=survey",
    label: "만족도 조사 대시보드",
    icon: "survey",
  },
  {
    href: "/backoffice/dispatch",
    label: "기사배정 임시",
    icon: "dispatch",
  },
  {
    href: "/backoffice/send-assignment-sms",
    label: "설치 배정 SMS 임시",
    icon: "sms",
  },
  {
    href: "/backoffice/settings",
    label: "설정",
    icon: "settings",
    subItems: [
      {
        href: "/backoffice/settings/users",
        label: "유저 관리",
        icon: "settings",
      },
      {
        href: "/backoffice/settings/system-settings",
        label: "시스템 설정",
        icon: "settings",
      },
      {
        href: "/backoffice/settings/system-status",
        label: "시스템 상태",
        icon: "settings",
      },
      {
        href: "/backoffice/settings/sms-templates",
        label: "SMS 템플릿",
        icon: "settings",
      },
      {
        href: "/backoffice/settings/data-import/installers",
        label: "설치 기사 가져오기",
        icon: "settings",
      },
      {
        href: "/backoffice/settings/json-entities",
        label: "매핑/라벨 확인",
        icon: "settings",
      },
    ],
  },
];

export function isBackofficeMenuItemActive(pathname: string, href: string, searchParams?: URLSearchParams) {
  const normalizedPathname = pathname.split("?")[0] ?? pathname;
  const hrefPath = href.split("?")[0] ?? href;
  const hrefQuery = href.includes("?") ? new URLSearchParams(href.split("?")[1]) : null;

  if (hrefPath === "/backoffice") {
    return normalizedPathname === hrefPath;
  }

  // Exact path matching logic
  const isPathMatch = normalizedPathname === hrefPath || (hrefPath !== "/backoffice" && normalizedPathname.startsWith(`${hrefPath}/`));

  if (!isPathMatch) {
    return false;
  }

  // If href has tab query parameter, check searchParams if provided
  if (hrefQuery?.has("tab") && searchParams) {
    return searchParams.get("tab") === hrefQuery.get("tab") || (hrefQuery.get("tab") === "query" && !searchParams.get("tab"));
  }

  return true;
}

export function isBackofficeSubmenuExpanded({
  collapsed,
  isActive,
  manuallyExpandedPathname,
  collapsedPathname,
  pathname,
}: {
  collapsed: boolean;
  isActive: boolean;
  manuallyExpandedPathname: string | null;
  collapsedPathname: string | null;
  pathname: string;
}) {
  const isManuallyExpanded = manuallyExpandedPathname === pathname;

  if (collapsed) {
    return isManuallyExpanded;
  }

  return isActive ? collapsedPathname !== pathname : isManuallyExpanded;
}

export default function BackofficeSidebarNav({
  id,
  className,
  collapsed = false,
  onNavigate,
}: {
  id?: string;
  className?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav
      id={id}
      className={
        className ??
        (collapsed
          ? "flex flex-col items-center gap-1 overflow-visible px-2 py-5"
          : "flex gap-1 overflow-x-auto px-3 py-2 md:block md:space-y-0.5 md:overflow-visible md:px-4 md:py-5")
      }
      aria-label="백오피스 메뉴"
    >
      {menuItems.map((item) => (
        <BackofficeSidebarNavItem
          key={item.href}
          item={item}
          pathname={pathname}
          searchParams={searchParams}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function BackofficeSidebarNavItem({
  item,
  pathname,
  searchParams,
  collapsed,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  searchParams: URLSearchParams;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isChildActive = Boolean(item.subItems?.some((sub) => isBackofficeMenuItemActive(pathname, sub.href, searchParams)));
  const isActive = isBackofficeMenuItemActive(pathname, item.href, searchParams) || isChildActive;
  const hasSubItems = Boolean(item.subItems?.length);
  const [manuallyExpandedPathname, setManuallyExpandedPathname] = useState<string | null>(null);
  const [collapsedPathname, setCollapsedPathname] = useState<string | null>(null);
  const isExpanded = isBackofficeSubmenuExpanded({
    collapsed,
    isActive,
    manuallyExpandedPathname,
    collapsedPathname,
    pathname,
  });

  function handleSubmenuNavigate() {
    if (collapsed || onNavigate) {
      setManuallyExpandedPathname(null);
      setCollapsedPathname(null);
    }
    onNavigate?.();
  }

  const itemClassName = [
    "group relative whitespace-nowrap rounded-md text-left text-sm leading-5 transition",
    collapsed ? "flex size-10 items-center justify-center p-0" : "block w-full px-2.5 py-2 md:whitespace-normal",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
    isActive
      ? "bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200"
      : "font-medium text-slate-800 hover:bg-white hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200",
  ].join(" ");

  return (
    <div className="group/sidebar-item relative shrink-0 md:shrink">
      {hasSubItems ? (
        <button
          type="button"
          aria-current={isActive ? "page" : undefined}
          aria-expanded={isExpanded}
          aria-label={collapsed ? item.label : undefined}
          title={collapsed ? item.label : undefined}
          className={itemClassName}
          onClick={() => {
            if (isExpanded) {
              setManuallyExpandedPathname(null);
              setCollapsedPathname(isActive ? pathname : null);
              return;
            }

            setManuallyExpandedPathname(pathname);
            setCollapsedPathname(null);
          }}
        >
          <span className={collapsed ? "flex items-center justify-center" : "flex items-center justify-between gap-2"}>
            <span className={collapsed ? "flex items-center" : "flex min-w-0 items-center gap-2"}>
              <SidebarItemIcon icon={item.icon} />
              <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
            </span>
            <span
              aria-hidden="true"
              className={[
                "mr-1 h-2 w-2 shrink-0 border-b border-r border-current text-slate-400 transition group-hover:text-slate-700",
                collapsed ? "hidden" : "",
                isExpanded ? "translate-y-0.5 rotate-[225deg]" : "rotate-45",
              ].join(" ")}
            />
          </span>
        </button>
      ) : (
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          aria-label={collapsed ? item.label : undefined}
          title={collapsed ? item.label : undefined}
          className={itemClassName}
          onClick={onNavigate}
        >
          <span className={collapsed ? "flex items-center" : "flex min-w-0 items-center gap-2"}>
            <SidebarItemIcon icon={item.icon} />
            <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
          </span>
        </Link>
      )}

      {collapsed && !isExpanded ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/sidebar-item:opacity-100 group-focus-within/sidebar-item:opacity-100"
        >
          {item.label}
        </span>
      ) : null}

      {isExpanded && item.subItems ? (
        <nav
          className={
            collapsed
              ? "absolute left-full top-0 z-20 ml-2 w-56 space-y-0.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
              : "relative mt-1.5 ml-2 space-y-0.5 border-l border-slate-200 pl-3"
          }
          aria-label={`${item.label} 하위 메뉴`}
        >
          {item.subItems.map((subItem) => {
            const subItemActive = isBackofficeMenuItemActive(pathname, subItem.href, searchParams);

            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                aria-current={subItemActive ? "page" : undefined}
                onClick={handleSubmenuNavigate}
                className={[
                  "relative block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] leading-5 transition md:whitespace-normal",
                  subItemActive
                    ? "font-semibold text-slate-950"
                    : "text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200",
                ].join(" ")}
              >
                {subItemActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[15px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-slate-950"
                  />
                ) : null}
                {subItem.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

function SidebarItemIcon({ icon }: { icon: MenuItem["icon"] }) {
  const commonProps = {
    viewBox: "0 0 20 20",
    fill: "none",
    className: "size-4 shrink-0",
    "aria-hidden": true,
  } as const;

  if (icon === "orders") {
    return (
      <svg {...commonProps}>
        <path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "database") {
    return (
      <svg {...commonProps}>
        <ellipse cx="10" cy="4.5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 4.5v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5M4 9.5v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (icon === "queue") {
    return (
      <svg {...commonProps}>
        <path d="M5 4h11M5 10h11M5 16h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="2.5" cy="4" r=".75" fill="currentColor" />
        <circle cx="2.5" cy="10" r=".75" fill="currentColor" />
        <circle cx="2.5" cy="16" r=".75" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "search") {
    return (
      <svg {...commonProps}>
        <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="m12.2 12.2 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "dashboard") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (icon === "as") {
    return (
      <svg {...commonProps}>
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 2v3M10 15v3M2 10h3M15 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "installer") {
    return (
      <svg {...commonProps}>
        <path d="M13 16v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1M10 7a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "query") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "survey") {
    return (
      <svg {...commonProps}>
        <path d="M4 16V9a2 2 0 012-2h2a2 2 0 012 2v7M10 16V5a2 2 0 012-2h2a2 2 0 012 2v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "dispatch") {
    return (
      <svg {...commonProps}>
        <path d="M8 7h8m0 0l-3-3m3 3l-3 3m-5 3H4m0 0l3 3m-3-3l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "sms") {
    return (
      <svg {...commonProps}>
        <path d="M3 5h14a1 1 0 011 1v8a1 1 0 01-1 1H5l-3 3V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
