import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/adminAuth";
import { serializeIotPass } from "@/lib/iotPass";
import { prisma } from "@/lib/prisma";
import BackofficePageHeader from "../../BackofficePageHeader";
import { getBackofficeButtonClass } from "../../backoffice-button-styles";
import IotPassForm from "../IotPassForm";
import { PURCHASE_STATUS_LABEL } from "../shared";

export const dynamic = "force-dynamic";

export default async function BackofficeIotPassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 목록 API 와 같은 등급을 여기서도 요구한다. 이 페이지는 API 를 거치지 않고
  // Prisma 로 직접 읽으므로, 막지 않으면 등급 0 계정이 우회해서 볼 수 있다.
  const admin = await requireAdminPage(`/backoffice/iot-pass/${id}`, 1);

  const row = await prisma.device_feature_upgrades.findUnique({ where: { id } });
  if (!row) notFound();

  const shipped = await prisma.shippedDevice.findUnique({
    where: { sn: row.sn },
    select: { model: true },
  });
  const item = serializeIotPass(row, shipped);

  return (
    <div>
      <BackofficePageHeader
        title={item.sn}
        meta={`${PURCHASE_STATUS_LABEL[item.purchaseStatus] ?? item.purchaseStatus} · ${item.featureCode}`}
        leading={
          <Link href="/backoffice/iot-pass" className={getBackofficeButtonClass("secondary", "sm")}>
            ← 목록
          </Link>
        }
      />
      <IotPassForm item={item} canManage={admin.level >= 1} />
    </div>
  );
}
