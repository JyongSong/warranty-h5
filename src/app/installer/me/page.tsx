import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerContact } from "@/lib/installation/installer/source";
import { formatKrPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { isSettlementLaunched } from "@/lib/installation/settlement/statements";
import { isPopbillTaxInvoiceEnabled } from "@/lib/installer/popbill-tax-invoice";
import MeView, { type MeBadge } from "./MeView";

export const dynamic = "force-dynamic";

const SETTLEMENT_STATUS: Record<string, MeBadge> = {
  NONE: { text: "미등록", bg: "#fee2e2", color: "#991b1b" },
  SUBMITTED: { text: "확인 중", bg: "#fef3c7", color: "#92400e" },
  APPROVED: { text: "승인", bg: "#d1fae5", color: "#065f46" },
  REJECTED: { text: "반려", bg: "#fee2e2", color: "#991b1b" },
};

const POPBILL_STATUS: Record<"NONE" | "READY", MeBadge> = {
  NONE: { text: "미연동", bg: "#f4f4f5", color: "#52525b" },
  READY: { text: "연동 완료", bg: "#d1fae5", color: "#065f46" },
};

export default async function InstallerMePage() {
  const installer = await requireInstallerPage("/installer/me");
  // 세션에는 id/name 만 있어 지점·연락처는 등록부에서 읽는다.
  const profile = await getInstallerContact(installer.id).catch(() => null);

  // 정산 기능 공개 전에는 「정산」 묶음(정산 정보 등록·전자세금계산서 연동)을 숨긴다.
  const settlementLaunched = await isSettlementLaunched().catch(() => false);
  let settlement: { infoBadge: MeBadge; popbillBadge: MeBadge | null } | null = null;
  if (settlementLaunched) {
    const [info, popbillEnabled] = await Promise.all([
      prisma.installerSettlementInfo
        .findUnique({ where: { installerId: installer.id }, select: { status: true } })
        .catch(() => null),
      isPopbillTaxInvoiceEnabled().catch(() => false),
    ]);
    // 팝빌 전자세금계산서 공개 전에는 「전자세금계산서 연동」을 숨긴다.
    const link = popbillEnabled
      ? await prisma.installerPopbillLink
          .findUnique({ where: { installerId: installer.id }, select: { status: true } })
          .catch(() => null)
      : null;
    settlement = {
      infoBadge: info ? (SETTLEMENT_STATUS[info.status] ?? SETTLEMENT_STATUS.NONE) : SETTLEMENT_STATUS.NONE,
      popbillBadge: popbillEnabled ? POPBILL_STATUS[link?.status === "READY" ? "READY" : "NONE"] : null,
    };
  }

  return (
    <MeView
      name={profile?.name ?? installer.name}
      phone={profile?.phone ? formatKrPhone(profile.phone) : null}
      branch={profile?.branch?.trim() || null}
      region={profile?.region?.trim() || null}
      settlement={settlement}
    />
  );
}
