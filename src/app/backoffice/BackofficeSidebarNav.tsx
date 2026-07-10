"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MenuItem = {
  href: string;
  label: string;
  subItems?: MenuItem[];
};

const menuItems: MenuItem[] = [
  {
    href: "/backoffice/installation-order-source",
    label: "ERP 주문 데이터",
  },
  {
    href: "/backoffice/installations?statusView=active",
    label: "설치 업무 큐",
  },
  {
    href: "/backoffice/installation-search",
    label: "주문 검색",
  },
  {
    href: "/backoffice/settings",
    label: "설정",
    subItems: [
      {
        href: "/backoffice/settings/users",
        label: "유저 관리",
      },
      {
        href: "/backoffice/settings/system-settings",
        label: "시스템 설정",
      },
      {
        href: "/backoffice/settings/system-status",
        label: "시스템 상태",
      },
      {
        href: "/backoffice/settings/sms-templates",
        label: "SMS 템플릿",
      },
      {
        href: "/backoffice/settings/data-import/installers",
        label: "설치 기사 가져오기",
      },
      {
        href: "/backoffice/settings/json-entities",
        label: "매핑/라벨 확인",
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

export default function BackofficeSidebarNav({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        className ?? "flex gap-1 overflow-x-auto px-3 py-2 md:block md:space-y-0.5 md:overflow-visible md:px-4 md:py-5"
      }
      aria-label="백오피스 메뉴"
    >
      {menuItems.map((item) => (
        <BackofficeSidebarNavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function BackofficeSidebarNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = isBackofficeMenuItemActive(pathname, item.href);
  const hasSubItems = Boolean(item.subItems?.length);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const [collapsedPathname, setCollapsedPathname] = useState<string | null>(null);
  const isExpanded = isActive ? collapsedPathname !== pathname : isManuallyExpanded;

  const itemClassName = [
    "group relative block w-full whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm leading-5 transition md:whitespace-normal",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
    isActive
      ? "bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200"
      : "font-medium text-slate-800 hover:bg-white hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200",
  ].join(" ");

  return (
    <div className="shrink-0 md:shrink">
      {hasSubItems ? (
        <button
          type="button"
          aria-current={isActive ? "page" : undefined}
          aria-expanded={isExpanded}
          className={itemClassName}
          onClick={() => {
            if (isExpanded) {
              setIsManuallyExpanded(false);
              setCollapsedPathname(isActive ? pathname : null);
              return;
            }

            setIsManuallyExpanded(true);
            setCollapsedPathname(null);
          }}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <span
              aria-hidden="true"
              className={[
                "mr-1 h-2 w-2 shrink-0 border-b border-r border-current text-slate-400 transition group-hover:text-slate-700",
                isExpanded ? "translate-y-0.5 rotate-[225deg]" : "rotate-45",
              ].join(" ")}
            />
          </span>
        </button>
      ) : (
        <Link href={item.href} aria-current={isActive ? "page" : undefined} className={itemClassName} onClick={onNavigate}>
          <span className="truncate">{item.label}</span>
        </Link>
      )}

      {isExpanded && item.subItems ? (
        <nav className="relative mt-1.5 ml-2 space-y-0.5 border-l border-slate-200 pl-3" aria-label={`${item.label} 하위 메뉴`}>
          {item.subItems.map((subItem) => {
            const subItemActive = isBackofficeMenuItemActive(pathname, subItem.href);

            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                aria-current={subItemActive ? "page" : undefined}
                onClick={onNavigate}
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
