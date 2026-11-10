import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import {
  formatYm,
  getHqInvoiceInfo,
  getInstallerStatement,
  isSettlementLaunched,
  isValidYm,
  ymBounds,
} from "@/lib/installation/settlement/statements";
import StatementClient from "./StatementClient";

export const dynamic = "force-dynamic";

export default async function InstallerStatementPage({ params }: { params: Promise<{ ym: string }> }) {
  const { ym } = await params;
  const installer = await requireInstallerPage(`/installer/statement/${ym}`);
  if (!isValidYm(ym) || !(await isSettlementLaunched())) notFound();
  const [statement, hq] = await Promise.all([getInstallerStatement(installer.id, ym), getHqInvoiceInfo()]);
  if (!statement) notFound();
  return (
    <StatementClient
      statement={statement}
      hq={hq}
      ymLabel={formatYm(ym)}
      writeDate={ymBounds(ym).lastDate}
    />
  );
}
