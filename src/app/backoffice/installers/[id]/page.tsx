import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { formatKrPhone } from "@/lib/phone";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import InstallerForm from "../InstallerForm";
import type { InstallerItem } from "../shared";

export const dynamic = "force-dynamic";

export default async function BackofficeInstallerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 목록 API(GET /api/installers)가 등급 1 을 요구한다. 이 페이지는 API 를 거치지
  // 않고 Prisma 로 직접 읽으므로, 같은 등급을 여기서 막지 않으면 등급 0 계정이
  // API 로는 못 보던 기사 정보를 볼 수 있게 된다.
  const admin = await requireAdminPage(`/backoffice/installers/${id}`, 1);

  const row = await prisma.installer.findUnique({ where: { id } });
  if (!row) notFound();

  const item: InstallerItem = {
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  };

  return (
    <div>
      <BackofficePageHeader
        title={item.name}
        meta={formatKrPhone(item.phone)}
        leading={
          <Link href="/backoffice/installers" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 목록
          </Link>
        }
      />
      <InstallerForm item={item} canManage={admin.level >= 1} />
    </div>
  );
}
