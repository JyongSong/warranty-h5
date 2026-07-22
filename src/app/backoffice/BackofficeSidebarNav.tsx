"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MenuItem = {
  href: string;
  label: string;
  icon: "database" | "queue" | "search" | "settings";
  subItems?: MenuItem[];
};

const menuItems: MenuItem[] = [
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

export function isBackofficeMenuItemActive(pathname: string, href: string) {
  const normalizedPathname = pathname.split("?")[0] ?? pathname;
  const normalizedHref = href.split("?")[0] ?? href;
  if (normalizedHref === "/backoffice") {
    return normalizedPathname === normalizedHref;
  }

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
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
  collapsed,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isActive = isBackofficeMenuItemActive(pathname, item.href);
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
    // Keep the expanded desktop submenu mounted while the route changes. Closing
    // it here makes the first settings navigation briefly hide the submenu before
    // the new pathname marks the settings section active and opens it again.
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
            const subItemActive = isBackofficeMenuItemActive(pathname, subItem.href);

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

  return (
    <svg {...commonProps}>
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
