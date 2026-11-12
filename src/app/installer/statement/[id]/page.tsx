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
import { isPopbillTaxInvoiceEnabled } from "@/lib/installer/popbill-tax-invoice";
import { prisma } from "@/lib/prisma";
import StatementClient from "./StatementClient";

export const dynamic = "force-dynamic";

export default async function InstallerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const installer = await requireInstallerPage(`/installer/statement/${id}`);
  if (!(await isSettlementLaunched())) notFound();
  const statement = await getInstallerStatementById(installer.id, id);
  if (!statement) notFound();
  const [hq, lines, popbillEnabled] = await Promise.all([
    getHqInvoiceInfo(),
    listStatementLines(statement.id),
    isPopbillTaxInvoiceEnabled().catch(() => false),
  ]);
  // 전자세금계산서 기사만 앱 발행을 쓴다. 연동 상태는 화면 안내용이고 발행 때 팝빌에 다시 확인한다.
  const popbill =
    popbillEnabled && statement.taxDocType === "E_TAX_INVOICE"
      ? {
          ready:
            (
              await prisma.installerPopbillLink
                .findUnique({ where: { installerId: installer.id }, select: { status: true } })
                .catch(() => null)
            )?.status === "READY",
        }
      : null;
  return (
    <StatementClient
      statement={statement}
      lines={lines}
      hq={hq}
      ymLabel={formatYm(statement.ym)}
      writeDate={ymBounds(statement.ym).lastDate}
      popbill={popbill}
    />
  );
}
