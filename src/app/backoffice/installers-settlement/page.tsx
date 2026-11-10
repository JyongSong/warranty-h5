import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  listInstallSettlementLinesWithOrder,
  listSettlementPeriods,
} from "@/lib/installation/settlement/service";
import { getAgentProxyBaseFeeDefault, getGlobalDefaults } from "@/lib/installation/settlement/rates";
import { listInstallerRateOverrides } from "@/lib/installation/settlement/installer-rates";
import SettlementClient from "./SettlementClient";
import StatementsTab from "./StatementsTab";
import {
  currentYm,
  earlierUnissued,
  isSettlementLaunched,
  isValidYm,
  listMonthStatements,
  previewMonth,
  shiftYm,
} from "@/lib/installation/settlement/statements";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  ym?: string;
  periodId?: string;
  startDate?: string;
  endDate?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 오늘(KST) 기준 이번 달 1일 ~ 오늘
function currentMonthRangeKst(): { startDate: string; endDate: string } {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate: `${today.slice(0, 8)}01`, endDate: today };
}

export default async function BackofficeInstallerSettlementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBackofficeUserPage("/backoffice/installers-settlement");
  const sp = await searchParams;
  const tab = sp.tab === "rates" ? "rates" : sp.tab === "statements" ? "statements" : "settlement";
  const launched = await isSettlementLaunched();

  if (tab === "statements") {
    // 기본은 지난달: 이번 달은 아직 마감 전이라 발행할 수 없다.
    const ym = sp.ym && isValidYm(sp.ym) ? sp.ym : shiftYm(currentYm(), -1);
    // 같은 달을 나눠 발행할 수 있으므로 발행된 정산서와 아직 남은 미리보기를 함께 보여 준다.
    const [statements, preview, earlier] = await Promise.all([
      listMonthStatements(ym),
      previewMonth(ym),
      earlierUnissued(ym),
    ]);
    return (
      <div className="p-6">
        <StatementsTab
          key={ym}
          ym={ym}
          thisYm={currentYm()}
          statements={statements}
          preview={preview}
          launched={launched}
          earlier={earlier}
        />
      </div>
    );
  }

  const periods = await listSettlementPeriods();

  // 정산 주기로 보는 경우가 아니면 날짜 구간으로 본다. 날짜가 없으면 이번 달.
  const periodId = sp.periodId || "";
  const fallback = currentMonthRangeKst();
  const startDate = DATE_RE.test(sp.startDate ?? "") ? sp.startDate! : periodId ? "" : fallback.startDate;
  const endDate = DATE_RE.test(sp.endDate ?? "") ? sp.endDate! : periodId ? "" : fallback.endDate;

  const [lines, rateDefaults, rateOverrides, agentProxyBaseFee] = await Promise.all([
    tab === "settlement"
      ? listInstallSettlementLinesWithOrder({
          periodId: periodId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        })
      : Promise.resolve([]),
    getGlobalDefaults(),
    listInstallerRateOverrides(),
    getAgentProxyBaseFeeDefault(),
  ]);

  return (
    <div className="p-6">
      <SettlementClient
        tab={tab}
        showStatementsTab={launched}
        periods={periods}
        filter={{ periodId, startDate, endDate }}
        lines={lines}
        rateDefaults={rateDefaults}
        rateOverrides={rateOverrides}
        agentProxyBaseFee={agentProxyBaseFee}
      />
    </div>
  );
}
