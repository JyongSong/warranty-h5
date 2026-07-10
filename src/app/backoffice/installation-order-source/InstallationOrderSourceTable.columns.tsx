"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import {
  formatBackofficeDateTime,
  formatBackofficePhone,
  formatBackofficeText,
} from "@/lib/backoffice/table-formatting";

const INSTALLATION_ORDER_SOURCE_COLUMN_LABELS = {
  customer_name: "고객명",
  phone: "연락처",
  address: "주소",
  due_date: "납기일자",
  order_numbers: "주문번호",
  no_girl: "출고번호",
  memo: "메모",
} as const;

export const installationOrderSourceColumns: ColumnDef<FetchedInstallationOrder>[] = [
  {
    accessorKey: "due_date",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.due_date,
    enableHiding: false,
    size: 130,
    minSize: 110,
    cell: ({ row }) => formatBackofficeDateTime(row.original.due_date),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "order_numbers",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.order_numbers,
    size: 170,
    minSize: 120,
    cell: ({ row }) => formatText(row.original.order_numbers),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "no_girl",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.no_girl,
    size: 130,
    minSize: 110,
    cell: ({ row }) => formatText(row.original.no_girl),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "customer_name",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.customer_name,
    enableHiding: false,
    size: 120,
    minSize: 90,
    cell: ({ row }) => (
      <span className="font-medium text-zinc-800">
        {formatText(row.original.customer_name)}
      </span>
    ),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "phone",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.phone,
    enableHiding: false,
    size: 150,
    minSize: 130,
    cell: ({ row }) => formatBackofficePhone(row.original.phone),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "address",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.address,
    enableHiding: false,
    size: 320,
    minSize: 160,
    cell: ({ row }) => (
      <span
        title={formatText(row.original.address)}
        className="line-clamp-2 whitespace-normal break-keep text-zinc-700"
      >
        {formatText(row.original.address)}
      </span>
    ),
    sortingFn: "alphanumeric",
  },
  {
    accessorKey: "memo",
    header: INSTALLATION_ORDER_SOURCE_COLUMN_LABELS.memo,
    size: 520,
    minSize: 180,
    cell: ({ row }) => (
      <span
        title={formatText(row.original.memo)}
        className="line-clamp-2 font-medium leading-5 whitespace-normal break-keep text-zinc-800"
      >
        {formatText(row.original.memo)}
      </span>
    ),
    sortingFn: "alphanumeric",
  },
];

function formatText(value: string | null | undefined) {
  return formatBackofficeText(value);
}
