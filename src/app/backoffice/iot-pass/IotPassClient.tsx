"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AuthAdmin } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { formatKrPhone } from "@/lib/phone";
import BackofficeDataTable from "../BackofficeDataTable";
import BackofficePageHeader from "../BackofficePageHeader";
import { getBackofficeButtonClass } from "../backoffice-button-styles";
import {
  FEATURE_CODE_SUGGESTIONS,
  PAYMENT_PROVIDER_LABEL,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_OPTIONS,
  formatKstDateTime,
  readJson,
  type IotPassItem,
} from "./shared";

// 기사 관리와 같은 표 컴포넌트를 쓴다. 컬럼 보기·순서·너비 설정이 딸려 오고
// storageKey 단위로 사용자별 설정이 남는다.
const TABLE_PREFS_KEY = "backoffice.iotPass.table";

type ShippedFilter = "" | "SHIPPED" | "UNKNOWN";

export default function IotPassClient({ admin }: { admin: AuthAdmin }) {
  const canManage = admin.level >= 1;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");
  const [shippedFilter, setShippedFilter] = useState<ShippedFilter>("");

  const [items, setItems] = useState<IotPassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SN·연락처·상태·기능은 서버가 걸러 주고, 출고 목록 대조는 받아온 목록에서 거른다.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (featureFilter.trim()) params.set("feature", featureFilter.trim());

        const res = await fetch(`/api/iot-pass${params.toString() ? `?${params}` : ""}`, {
          cache: "no-store",
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(String(data?.error ?? "IoT Pass 목록을 불러오지 못했습니다."));
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? (data.items as IotPassItem[]) : []);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, "IoT Pass 목록을 불러오지 못했습니다."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const handle = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, statusFilter, featureFilter]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (shippedFilter === "SHIPPED" && !item.shipped) return false;
        if (shippedFilter === "UNKNOWN" && item.shipped) return false;
        return true;
      }),
    [items, shippedFilter],
  );

  const hasAnyFilter =
    query.trim().length > 0 ||
    statusFilter !== "" ||
    featureFilter.trim().length > 0 ||
    shippedFilter !== "";

  const paidCount = items.filter((item) => item.purchaseStatus === "paid").length;
  const unknownCount = items.filter((item) => !item.shipped).length;

  const columns = useMemo<ColumnDef<IotPassItem>[]>(
    () => [
      {
        accessorKey: "sn",
        header: "SN",
        enableHiding: false,
        size: 170,
        cell: ({ row }) => (
          <Link
            href={`/backoffice/iot-pass/${row.original.id}`}
            className="font-mono font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 transition hover:text-blue-900 hover:decoration-blue-500"
          >
            {row.original.sn}
          </Link>
        ),
      },
      {
        id: "deviceModel",
        accessorFn: (row) => row.deviceModel ?? "",
        header: "모델",
        size: 130,
        cell: ({ row }) => {
          // 출고 목록에 없는 SN 은 기기 검증(ble_upgrade)에서도 막힌다. 눈에 띄게 표시한다.
          if (!row.original.shipped) {
            return <span className="font-semibold text-red-600">출고 목록에 없음</span>;
          }
          return row.original.deviceModel || "-";
        },
      },
      {
        id: "purchaseStatus",
        accessorFn: (row) => row.purchaseStatus,
        header: "결제 상태",
        size: 110,
        cell: ({ row }) => {
          const value = row.original.purchaseStatus;
          return value === "paid" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              결제 완료
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
              {PURCHASE_STATUS_LABEL[value] ?? value}
            </span>
          );
        },
      },
      {
        id: "featureCode",
        accessorFn: (row) => row.featureCode,
        header: "기능",
        size: 100,
        cell: ({ row }) => row.original.featureCode || "-",
      },
      {
        id: "contact",
        accessorFn: (row) => row.contact ?? "",
        header: "연락처",
        size: 140,
        cell: ({ row }) => {
          const contact = row.original.contact;
          if (!contact) return "-";
          // 웹훅이 넣는 값은 전화번호지만 "Unknown" 같은 문자열도 들어온다.
          return /^[0-9-]+$/.test(contact) ? formatKrPhone(contact) : contact;
        },
      },
      {
        id: "paymentProvider",
        accessorFn: (row) => row.paymentProvider,
        header: "결제 경로",
        size: 120,
        cell: ({ row }) =>
          PAYMENT_PROVIDER_LABEL[row.original.paymentProvider] ?? row.original.paymentProvider ?? "-",
      },
      {
        id: "paidAt",
        accessorFn: (row) => row.paidAt ?? "",
        header: "결제일시",
        size: 140,
        cell: ({ row }) => formatKstDateTime(row.original.paidAt),
      },
      {
        id: "lastHubBoundAt",
        accessorFn: (row) => row.lastHubBoundAt ?? "",
        header: "허브 연동",
        size: 140,
        cell: ({ row }) => formatKstDateTime(row.original.lastHubBoundAt),
      },
      {
        id: "createdAt",
        accessorFn: (row) => row.createdAt ?? "",
        header: "등록일",
        size: 140,
        cell: ({ row }) => formatKstDateTime(row.original.createdAt),
      },
      {
        id: "updatedAt",
        accessorFn: (row) => row.updatedAt ?? "",
        header: "수정일",
        size: 140,
        cell: ({ row }) => formatKstDateTime(row.original.updatedAt),
      },
    ],
    [],
  );

  return (
    <div>
      <BackofficePageHeader
        title="IoT Pass 관리"
        meta={
          loading
            ? "불러오는 중…"
            : `${visibleItems.length}건${
                visibleItems.length !== items.length ? ` / 전체 ${items.length}건` : ""
              } · 결제 완료 ${paidCount}건`
        }
        actions={
          canManage ? (
            <Link href="/backoffice/iot-pass/new" className={getBackofficeButtonClass("primary", "lg")}>
              IoT Pass 추가
            </Link>
          ) : null
        }
      />

      {!canManage ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          현재 계정은 조회 전용입니다. 등급 1 이상만 추가·수정·삭제할 수 있습니다.
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
                setStatusFilter("");
                setFeatureFilter("");
                setShippedFilter("");
              }}
              className={getBackofficeButtonClass("secondary", "sm")}
            >
              초기화
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="SN / 연락처">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="A0146… 또는 010…"
              className={filterInputClass}
            />
          </FilterField>

          <FilterField label="결제 상태">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="">전체</option>
              {PURCHASE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="기능 코드">
            <input
              list="iot-pass-feature-codes"
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              placeholder="예: zigbee"
              className={filterInputClass}
            />
            <datalist id="iot-pass-feature-codes">
              {[...new Set([...FEATURE_CODE_SUGGESTIONS, ...items.map((i) => i.featureCode)])]
                .filter(Boolean)
                .map((code) => (
                  <option key={code} value={code} />
                ))}
            </datalist>
          </FilterField>

          <FilterField label="출고 목록 대조">
            <select
              value={shippedFilter}
              onChange={(e) => setShippedFilter(e.target.value as ShippedFilter)}
              className={filterInputClass}
            >
              <option value="">전체</option>
              <option value="SHIPPED">출고 기기</option>
              <option value="UNKNOWN">출고 목록에 없음 ({unknownCount})</option>
            </select>
          </FilterField>
        </div>
      </div>

      <BackofficeDataTable
        columns={columns}
        data={visibleItems}
        emptyMessage={loading ? "불러오는 중…" : "조건에 맞는 IoT Pass 기록이 없습니다."}
        storageKey={TABLE_PREFS_KEY}
        getRowId={(row) => row.id}
        lockedLeadingColumnIds={["sn"]}
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
