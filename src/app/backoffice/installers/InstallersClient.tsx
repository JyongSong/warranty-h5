"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AuthAdmin } from "@/lib/adminAuth";
import { formatKrPhone } from "@/lib/phone";
import { getErrorMessage } from "@/lib/error";
import { formatBackofficeDateTime } from "@/lib/backoffice/table-formatting";
import BackofficeDataTable from "../BackofficeDataTable";
import BackofficePageHeader from "../BackofficePageHeader";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import { exportInstallersToExcel } from "./export";
import {
  AQARA_APP_LABEL,
  CAPABILITY_LABEL,
  CAPABILITY_OPTIONS,
  STANDARD_REGIONS,
  readJson,
  type InstallerItem,
} from "./shared";

// 설치 업무 큐와 같은 표 컴포넌트를 쓴다. 컬럼 보기·순서·너비 설정이 딸려 오고
// storageKey 단위로 사용자별 설정이 남는다.
const TABLE_PREFS_KEY = "backoffice.installers.table";

type RosterFilter = "" | "IN" | "OUT";
type ActiveFilter = "" | "ACTIVE" | "INACTIVE";

export default function InstallersClient({ admin }: { admin: AuthAdmin }) {
  const canManage = admin.level >= 1;

  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [capabilityFilters, setCapabilityFilters] = useState<string[]>([]);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("");

  const [items, setItems] = useState<InstallerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 서버가 걸러 주는 조건(이름·소속·광역·설치능력)은 요청에 싣고,
  // 명단/활성은 받아온 목록에서 거른다. 목록이 500건 이하라 화면에서 거르는 편이 빠르다.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        if (branchFilter.trim()) params.set("branch", branchFilter.trim());
        if (regionFilter.trim()) params.set("region", regionFilter.trim());
        if (capabilityFilters.length > 0) params.set("capabilities", capabilityFilters.join(","));

        const res = await fetch(`/api/installers${params.toString() ? `?${params}` : ""}`, {
          cache: "no-store",
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(String(data?.error ?? "기사를 불러오지 못했습니다."));
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? (data.items as InstallerItem[]) : []);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, "기사를 불러오지 못했습니다."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const handle = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, branchFilter, regionFilter, capabilityFilters]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (rosterFilter === "IN" && !item.inCurrentRoster) return false;
        if (rosterFilter === "OUT" && item.inCurrentRoster) return false;
        if (activeFilter === "ACTIVE" && !item.active) return false;
        if (activeFilter === "INACTIVE" && item.active) return false;
        return true;
      }),
    [items, rosterFilter, activeFilter],
  );

  const hasAnyFilter =
    query.trim().length > 0 ||
    branchFilter.trim().length > 0 ||
    regionFilter.trim().length > 0 ||
    capabilityFilters.length > 0 ||
    rosterFilter !== "" ||
    activeFilter !== "";

  const columns = useMemo<ColumnDef<InstallerItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "이름",
        enableHiding: false,
        size: 140,
        minSize: 100,
        cell: ({ row }) => (
          <Link
            href={`/backoffice/installers/${row.original.id}`}
            className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 transition hover:text-blue-900 hover:decoration-blue-500"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "phone",
        header: "전화번호",
        size: 130,
        cell: ({ row }) => formatKrPhone(row.original.phone),
      },
      {
        id: "branch",
        accessorFn: (row) => row.branch ?? "",
        header: "소속",
        size: 140,
        cell: ({ row }) => row.original.branch || "-",
      },
      {
        id: "region",
        accessorFn: (row) => row.region ?? "",
        header: "광역",
        size: 90,
        cell: ({ row }) => row.original.region || "-",
      },
      {
        id: "serviceAreas",
        accessorFn: (row) => row.serviceAreas.length,
        header: "담당 지역",
        size: 220,
        cell: ({ row }) => {
          const areas = row.original.serviceAreas;
          // 담당 지역이 비면 이 기사에게는 배차가 가지 않는다. 눈에 띄게 표시한다.
          if (areas.length === 0) {
            return <span className="font-semibold text-red-600">없음 (배차 불가)</span>;
          }
          return (
            <span title={areas.join(", ")}>
              <span className="font-medium">{areas.length}곳</span>
              <span className="ml-1.5 text-zinc-500">{areas.slice(0, 2).join(", ")}</span>
              {areas.length > 2 ? <span className="text-zinc-400"> 외 {areas.length - 2}</span> : null}
            </span>
          );
        },
      },
      {
        id: "capabilities",
        accessorFn: (row) => row.capabilities.join(","),
        header: "설치 가능",
        size: 180,
        cell: ({ row }) => {
          const caps = row.original.capabilities;
          if (caps.length === 0) {
            return <span className="font-semibold text-red-600">없음 (배차 불가)</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {caps.map((cap) => (
                <span
                  key={cap}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700"
                >
                  {CAPABILITY_LABEL[cap] ?? cap}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: "aqaraAppCapability",
        accessorFn: (row) => row.aqaraAppCapability,
        header: "Aqara 연동",
        size: 140,
        cell: ({ row }) => {
          const value = row.original.aqaraAppCapability;
          return (
            <span className={value === "NONE" ? "text-zinc-500" : "font-medium text-emerald-700"}>
              {AQARA_APP_LABEL[value] ?? value}
            </span>
          );
        },
      },
      {
        id: "hasAqaraHubInventory",
        accessorFn: (row) => (row.hasAqaraHubInventory ? 1 : 0),
        header: "허브",
        size: 70,
        cell: ({ row }) => (row.original.hasAqaraHubInventory ? "보유" : "-"),
      },
      {
        id: "asEmergencyAvailability",
        accessorFn: (row) => row.asEmergencyAvailability ?? "",
        header: "A/S 긴급출동",
        size: 160,
        cell: ({ row }) => row.original.asEmergencyAvailability || "-",
      },
      {
        id: "inCurrentRoster",
        accessorFn: (row) => (row.inCurrentRoster ? 1 : 0),
        header: "명단",
        size: 90,
        cell: ({ row }) =>
          row.original.inCurrentRoster ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              명단
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
              명단 밖
            </span>
          ),
      },
      {
        id: "active",
        accessorFn: (row) => (row.active ? 1 : 0),
        header: "활성",
        size: 80,
        cell: ({ row }) =>
          row.original.active ? (
            <span className="text-zinc-700">활성</span>
          ) : (
            <span className="font-semibold text-zinc-400">비활성</span>
          ),
      },
      {
        id: "category",
        accessorFn: (row) => row.category ?? "",
        header: "분류",
        size: 90,
        cell: ({ row }) => row.original.category || "-",
      },
      {
        id: "installCount",
        accessorFn: (row) => row.installCount ?? -1,
        header: "설치 실적",
        size: 90,
        cell: ({ row }) => (row.original.installCount == null ? "-" : row.original.installCount),
      },
      {
        id: "updatedAt",
        accessorFn: (row) => row.updatedAt ?? "",
        header: "수정일",
        size: 130,
        cell: ({ row }) => formatBackofficeDateTime(row.original.updatedAt),
      },
    ],
    [],
  );

  const rosterOutCount = items.filter((item) => !item.inCurrentRoster).length;

  return (
    <div>
      <BackofficePageHeader
        title="기사 관리"
        meta={
          loading
            ? "불러오는 중…"
            : `${visibleItems.length}명${
                visibleItems.length !== items.length ? ` / 전체 ${items.length}명` : ""
              }`
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => exportInstallersToExcel(visibleItems)}
              disabled={visibleItems.length === 0}
              className={getBackofficeButtonClass("secondary", "lg")}
            >
              엑셀 내려받기
            </button>
            {canManage ? (
              <Link
                href="/backoffice/installers/new"
                className={getBackofficeButtonClass("primary", "lg")}
              >
                기사 추가
              </Link>
            ) : null}
          </>
        }
      />

      {!canManage ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          현재 계정은 조회 전용입니다. 등급 1 이상만 기사를 추가·수정·삭제할 수 있습니다.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-700">검색 / 필터</div>
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setBranchFilter("");
                setRegionFilter("");
                setCapabilityFilters([]);
                setRosterFilter("");
                setActiveFilter("");
              }}
              className={getBackofficeButtonClass("secondary", "sm")}
            >
              초기화
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="이름 / 전화번호">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="홍길동 또는 010…"
              className={filterInputClass}
            />
          </FilterField>

          <FilterField label="소속">
            <input
              list="installer-branches"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              placeholder="예: 전국열쇠, PL"
              className={filterInputClass}
            />
            <datalist id="installer-branches">
              {[...new Set(items.map((i) => i.branch).filter(Boolean))].map((branch) => (
                <option key={branch as string} value={branch as string} />
              ))}
            </datalist>
          </FilterField>

          <FilterField label="광역">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="">전체</option>
              {STANDARD_REGIONS.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="명단 / 활성">
            <div className="flex gap-2">
              <select
                value={rosterFilter}
                onChange={(e) => setRosterFilter(e.target.value as RosterFilter)}
                className={filterInputClass}
              >
                <option value="">명단 전체</option>
                <option value="IN">이번 명단</option>
                <option value="OUT">명단 밖 ({rosterOutCount})</option>
              </select>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
                className={filterInputClass}
              >
                <option value="">활성 전체</option>
                <option value="ACTIVE">활성</option>
                <option value="INACTIVE">비활성</option>
              </select>
            </div>
          </FilterField>

          <FilterField label="설치 가능 항목" wide>
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_OPTIONS.map((option) => {
                const on = capabilityFilters.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setCapabilityFilters((prev) =>
                        prev.includes(option.value)
                          ? prev.filter((v) => v !== option.value)
                          : [...prev, option.value],
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      on
                        ? "bg-zinc-950 text-white"
                        : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              {capabilityFilters.length > 1 ? (
                <span className="self-center text-xs text-zinc-500">
                  ※ 선택한 항목을 모두 갖춘 기사만 (AND)
                </span>
              ) : null}
            </div>
          </FilterField>
        </div>
      </div>

      <BackofficeDataTable
        columns={columns}
        data={visibleItems}
        emptyMessage={loading ? "불러오는 중…" : "조건에 맞는 기사가 없습니다."}
        storageKey={TABLE_PREFS_KEY}
        getRowId={(row) => row.id}
        getRowClassName={(row) => (row.active ? "" : "opacity-60")}
        lockedLeadingColumnIds={["name"]}
      />
    </div>
  );
}

const filterInputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500";

function FilterField({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold text-zinc-600">{label}</span>
      {children}
    </label>
  );
}
