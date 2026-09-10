import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { prisma } from "@/lib/prisma";
import BackofficePageHeader from "../../../BackofficePageHeader";
import AsHistoryImportForm from "./AsHistoryImportForm";

export const dynamic = "force-dynamic";

export default async function BackofficeAsHistoryImportPage() {
  await requireBackofficeUserPage("/backoffice/settings/data-import/as-history", 1);
  const storedCount = await prisma.asInstallHistory.count();

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="A/S 설치이력 가져오기" />
      <AsHistoryImportForm storedCount={storedCount} />
    </div>
  );
}
