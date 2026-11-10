import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import {
  formatYm,
  getHqInvoiceInfo,
  getInstallerStatementById,
  isSettlementLaunched,
  listStatementLines,
  ymBounds,
} from "@/lib/installation/settlement/statements";
import StatementClient from "./StatementClient";

export const dynamic = "force-dynamic";

export default async function InstallerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const installer = await requireInstallerPage(`/installer/statement/${id}`);
  if (!(await isSettlementLaunched())) notFound();
  const statement = await getInstallerStatementById(installer.id, id);
  if (!statement) notFound();
  const [hq, lines] = await Promise.all([getHqInvoiceInfo(), listStatementLines(statement.id)]);
  return (
    <StatementClient
      statement={statement}
      lines={lines}
      hq={hq}
      ymLabel={formatYm(statement.ym)}
      writeDate={ymBounds(statement.ym).lastDate}
    />
  );
}
