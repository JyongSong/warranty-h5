import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { getAsSymptomLabel } from "@/lib/installation/as/symptom-codes";
import { getCompletionPhotoSignedUrls, type CompletionPhoto } from "@/lib/installer/storage";

export type AsInstallerStatus = "PENDING" | "ACCEPTED" | "REVIEW" | "COMPLETED";

export type AsInstallerOrderItem = {
  asOrderId: string;
  status: AsInstallerStatus;
  symptomCode: string;
  symptomLabel: string;
  symptomDetail: string | null;
  address: string | null;
  // Customer name/phone hidden until accepted (PRD §6.2).
  customerName: string | null;
  customerPhone: string | null;
  hqRejectionReason?: string | null; // set on ACCEPTED items with an unhandled HQ rejection
};

export type AsInstallerOrdersGrouped = {
  pending: AsInstallerOrderItem[];
  active: AsInstallerOrderItem[];
  completed: AsInstallerOrderItem[];
};

const asSelect = {
  id: true,
  status: true,
  symptomCode: true,
  symptomDetail: true,
  customerNameEncrypted: true,
  customerPhoneEncrypted: true,
  addressEncrypted: true,
  reviewStatus: true,
  hqRejectionReason: true,
} as const;

type AsRow = {
  id: string;
  status: string;
  symptomCode: string;
  symptomDetail: string | null;
  customerNameEncrypted: string | null;
  customerPhoneEncrypted: string | null;
  addressEncrypted: string | null;
  reviewStatus: string | null;
  hqRejectionReason: string | null;
};

function mapStatus(status: string): AsInstallerStatus {
  if (status === "WAITING_INSTALLER_RESPONSE") return "PENDING";
  if (status === "INSTALLER_ASSIGNED") return "ACCEPTED";
  if (status === "WAITING_HQ_REVIEW") return "REVIEW";
  return "COMPLETED";
}

function shape(o: AsRow): AsInstallerOrderItem {
  const status = mapStatus(o.status);
  const piiVisible = status !== "PENDING";
  return {
    asOrderId: o.id,
    status,
    symptomCode: o.symptomCode,
    symptomLabel: getAsSymptomLabel(o.symptomCode),
    symptomDetail: o.symptomDetail,
    address: decryptNullablePii(o.addressEncrypted),
    customerName: piiVisible ? decryptNullablePii(o.customerNameEncrypted) : null,
    customerPhone: piiVisible ? decryptNullablePii(o.customerPhoneEncrypted) : null,
    hqRejectionReason: status === "ACCEPTED" && o.reviewStatus === "REJECTED" ? o.hqRejectionReason : null,
  };
}

export async function getInstallerAsOrders(installerId: string): Promise<AsInstallerOrdersGrouped> {
  const rows = (await prisma.asOrder.findMany({
    where: {
      currentInstallerId: installerId,
      status: { in: ["WAITING_INSTALLER_RESPONSE", "INSTALLER_ASSIGNED", "WAITING_HQ_REVIEW", "COMPLETED"] },
    },
    orderBy: { statusChangedAt: "desc" },
    take: 100,
    select: asSelect,
  })) as AsRow[];

  const items = rows.map(shape);
  return {
    pending: items.filter((i) => i.status === "PENDING"),
    active: items.filter((i) => i.status === "ACCEPTED" || i.status === "REVIEW"),
    completed: items.filter((i) => i.status === "COMPLETED"),
  };
}

export async function getInstallerAsOrderView(
  installerId: string,
  asOrderId: string,
): Promise<AsInstallerOrderItem | null> {
  const order = (await prisma.asOrder.findUnique({
    where: { id: asOrderId },
    select: { ...asSelect, currentInstallerId: true },
  })) as (AsRow & { currentInstallerId: string | null }) | null;
  if (!order || order.currentInstallerId !== installerId) return null;
  return shape(order);
}

export type AsInstallerSubmission = {
  submittedAt: string;
  resolutionDetail: string | null;
  serviceFee: number | null;
  reviewStatus: string | null;
  photos: CompletionPhoto[];
};

/**
 * 기사 앱 A/S 상세용: 이 기사가 등록한 처리 완료 내용 (읽기 전용).
 * 아직 처리 완료를 등록하지 않았으면 null.
 */
export async function getInstallerAsSubmission(
  installerId: string,
  asOrderId: string,
): Promise<AsInstallerSubmission | null> {
  const o = await prisma.asOrder.findUnique({
    where: { id: asOrderId },
    select: {
      currentInstallerId: true,
      submittedAt: true,
      resolutionDetail: true,
      serviceFee: true,
      reviewStatus: true,
      completionPhotoPaths: true,
    },
  });
  if (!o || o.currentInstallerId !== installerId || !o.submittedAt) return null;
  return {
    submittedAt: o.submittedAt.toISOString(),
    resolutionDetail: o.resolutionDetail,
    serviceFee: o.serviceFee,
    reviewStatus: o.reviewStatus,
    photos: await getCompletionPhotoSignedUrls(o.completionPhotoPaths),
  };
}
