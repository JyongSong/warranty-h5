import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  fetchResolvedInstallationOrdersFromErp,
  getTodayKstOrderDate,
} from "@/lib/installation/orders/source/fetch/service";
import { annotateFetchedInstallationOrderValidation } from "@/lib/installation/orders/source/persistence";
import InstallationOrderSourceTable from "./InstallationOrderSourceTable";

type ResolvedInstallationOrder = Awaited<
  ReturnType<typeof fetchResolvedInstallationOrdersFromErp>
>[number];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function InstallationOrderSourcePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = "/backoffice/installation-order-source";

  await requireBackofficeUserPage(nextPath, 1);

  const today = formatErpDateForDateInput(getTodayKstOrderDate());
  const from = normalizeDateSearchParam(resolvedSearchParams.from) ?? today;
  const to = normalizeDateSearchParam(resolvedSearchParams.to) ?? from;

  let orders: ResolvedInstallationOrder[] = [];
  let errorMessage: string | undefined;

  try {
    orders = await fetchResolvedInstallationOrdersFromErp({
      from: formatDateInputForErpDate(from),
      to: formatDateInputForErpDate(to),
    });
    orders = orders.map(annotateFetchedInstallationOrderValidation);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  }

  return (
    <InstallationOrderSourceTable
      initialItems={orders}
      errorMessage={errorMessage}
      from={from}
      to={to}
    />
  );
}

function normalizeDateSearchParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const normalizedValue = rawValue.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return normalizedValue;
  if (/^\d{8}$/.test(normalizedValue)) return formatErpDateForDateInput(normalizedValue);

  return null;
}

function formatDateInputForErpDate(value: string) {
  return value.replaceAll("-", "");
}

function formatErpDateForDateInput(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
