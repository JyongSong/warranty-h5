import { notFound } from "next/navigation";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerOrderView } from "@/lib/installer/orders";
import { buildOrderGuideLines } from "@/lib/installer/notice";
import { getInstallerDistances } from "@/lib/installation/distance/service";
import { getInstallerSubmittedCompletion } from "@/lib/installation/completion/service";
import OrderDetailClient from "./OrderDetailClient";

export const dynamic = "force-dynamic";

// 「이 건 안내」의 장거리 예상 금액용. 경로 거리는 캐시되지만 처음 보는 주소면 지도 API 를 부르므로
// 오래 걸리면 거리 없이 보여 준다.
const DISTANCE_TIMEOUT_MS = 4000;

async function getDrivingMeters(installerId: string, address: string | null): Promise<number | null> {
  if (!address) return null;
  const lookup = getInstallerDistances({
    address,
    eligibleInstallerIds: [installerId],
    includeInstallerIds: [installerId],
  })
    .then((result) =>
      result.status === "OK" ? (result.included.find((row) => row.installerId === installerId)?.drivingMeters ?? null) : null,
    )
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DISTANCE_TIMEOUT_MS));
  return Promise.race([lookup, timeout]);
}

export default async function InstallerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const installer = await requireInstallerPage(`/installer/orders/${orderId}`);
  const item = await getInstallerOrderView(installer.id, orderId);
  if (!item) notFound();

  // 아직 작업 전인 건에만 보여 준다. 대행 건은 정산 방식이 달라 안내하지 않는다.
  const showGuide = (item.status === "PENDING" || item.status === "ACCEPTED") && !item.agentProxy;
  const guideLines = showGuide
    ? buildOrderGuideLines({
        installItems: item.installItems,
        agentProxy: item.agentProxy,
        drivingMeters: await getDrivingMeters(installer.id, item.address),
      })
    : [];

  // 완료 등록을 한 건(검수 대기·완료·반려 후 재등록 전)은 제출한 내용을 함께 보여 준다.
  const showSubmission = item.status === "REVIEW" || item.status === "COMPLETED" || !!item.rejectionReason;
  const completion = showSubmission ? await getInstallerSubmittedCompletion(installer.id, orderId) : null;

  return <OrderDetailClient item={item} guideLines={guideLines} completion={completion} />;
}
