import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  aggregateSettlementByInstaller,
  listSettlementLines,
  listSettlementPeriods,
  type SettlementLineFilter,
} from "@/lib/installation/settlement/service";
import { getGlobalDefaults } from "@/lib/installation/settlement/rates";
import { listInstallerRateOverrides } from "@/lib/installation/settlement/installer-rates";
import SettlementClient from "./SettlementClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  periodId?: string;
  installerId?: string;
  startDate?: string;
  endDate?: string;
};

export default async function BackofficeInstallerSettlementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBackofficeUserPage("/backoffice/installers-settlement");
  const sp = await searchParams;
  const tab = sp.tab === "rates" ? "rates" : "settlement";

  const periods = await listSettlementPeriods();

  const filter: SettlementLineFilter = {
    periodId: sp.periodId || undefined,
    installerId: sp.installerId || undefined,
    startDate: sp.startDate || undefined,
    endDate: sp.endDate || undefined,
  };
  const hasFilter = Boolean(filter.periodId || filter.startDate || filter.endDate || filter.installerId);

  const [lines, summary, rateDefaults, rateOverrides] = await Promise.all([
    hasFilter ? listSettlementLines(filter) : Promise.resolve([]),
    hasFilter ? aggregateSettlementByInstaller(filter) : Promise.resolve([]),
    getGlobalDefaults(),
    listInstallerRateOverrides(),
  ]);

  return (
    <div className="p-6">
      <SettlementClient
        tab={tab}
        periods={periods}
        filter={{
          periodId: filter.periodId ?? "",
          installerId: filter.installerId ?? "",
          startDate: filter.startDate ?? "",
          endDate: filter.endDate ?? "",
        }}
        hasFilter={hasFilter}
        lines={lines}
        summary={summary}
        rateDefaults={rateDefaults}
        rateOverrides={rateOverrides}
      />
    </div>
  );
}
