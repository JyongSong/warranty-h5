import "server-only";

import { prisma } from "@/lib/prisma";
import { sendAssignmentPushToInstaller } from "@/lib/installer/devices";
import type { TaxDocType } from "@/lib/installer/settlement-info-shared";

/**
 * 백오피스 「기사 정산 정보 관리」: 활동 기사 전원의 정산 정보·증빙 종류·팝빌 연동 상태를 한 표로 본다.
 * 정산 정보가 없는 기사도 「미등록」으로 나온다.
 */

export type SettlementInfoAdminRow = {
  installerId: string;
  name: string;
  branch: string | null;
  region: string | null;
  /** NONE = 미등록 */
  infoStatus: "NONE" | "SUBMITTED" | "APPROVED" | "REJECTED";
  taxDocType: TaxDocType | null;
  businessNumber: string | null;
  businessName: string | null;
  submittedAt: string | null;
  /** 팝빌 연동 기록. 확인한 적 없으면 null */
  popbill: { status: string; certExpiresAt: string | null; stale: boolean } | null;
  /** 증빙 종류 마지막 변경 */
  lastChange: { at: string; by: string; from: string | null; to: string | null } | null;
};

const SOURCE_LABEL: Record<string, string> = { INSTALLER: "기사", POPBILL_LINK: "팝빌 연동(자동)" };

export async function listSettlementInfoAdminRows(): Promise<SettlementInfoAdminRow[]> {
  const installers = await prisma.installer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      branch: true,
      region: true,
      settlementInfo: {
        select: { status: true, taxDocType: true, businessNumber: true, businessName: true, submittedAt: true },
      },
      popbillLink: { select: { status: true, certExpiresAt: true, corpNum: true } },
      settlementInfoChanges: {
        where: { field: "taxDocType" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, source: true, changedByAdminId: true, fromValue: true, toValue: true },
      },
    },
  });

  const adminIds = [
    ...new Set(installers.flatMap((i) => i.settlementInfoChanges.map((c) => c.changedByAdminId).filter(Boolean))),
  ] as string[];
  const admins = adminIds.length
    ? await prisma.backofficeUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
    : [];
  const adminName = new Map(admins.map((a) => [a.id, a.name ?? "관리자"]));

  return installers.map((i) => {
    const info = i.settlementInfo;
    const change = i.settlementInfoChanges[0];
    const bizNo = info?.businessNumber.replace(/\D/g, "") ?? null;
    return {
      installerId: i.id,
      name: i.name,
      branch: i.branch,
      region: i.region,
      infoStatus: (info?.status as SettlementInfoAdminRow["infoStatus"]) ?? "NONE",
      taxDocType: (info?.taxDocType as TaxDocType | null) ?? null,
      businessNumber: bizNo,
      businessName: info?.businessName ?? null,
      submittedAt: info?.submittedAt.toISOString() ?? null,
      popbill: i.popbillLink
        ? {
            status: i.popbillLink.status,
            certExpiresAt: i.popbillLink.certExpiresAt?.toISOString() ?? null,
            stale: bizNo !== null && bizNo !== i.popbillLink.corpNum,
          }
        : null,
      lastChange: change
        ? {
            at: change.createdAt.toISOString(),
            by: change.changedByAdminId
              ? (adminName.get(change.changedByAdminId) ?? "관리자")
              : (SOURCE_LABEL[change.source] ?? change.source),
            from: change.fromValue,
            to: change.toValue,
          }
        : null,
    };
  });
}

/**
 * 고른 기사에게 정산 정보 안내 알림. 정산 정보가 없으면 「등록」, 증빙 종류가 비어 있으면 「선택」을 부탁한다.
 * 둘 다 해당 없는 기사는 건너뛴다.
 */
export async function sendSettlementInfoReminders(installerIds: string[]): Promise<{ sent: number; skipped: number }> {
  const ids = [...new Set(installerIds)].slice(0, 500);
  const rows = await prisma.installer.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, settlementInfo: { select: { taxDocType: true } } },
  });
  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    const msg = !r.settlementInfo
      ? {
          title: "정산 정보를 등록해 주세요",
          body: "앱의 「내 정보 → 정산 정보 등록」에서 사업자·계좌 정보와 증빙 종류를 등록해 주세요. 등록해야 정산금이 지급됩니다.",
        }
      : !r.settlementInfo.taxDocType
        ? {
            title: "증빙 종류를 선택해 주세요",
            body: "앱의 「내 정보 → 정산 정보 등록」에서 증빙 종류(세금계산서·현금영수증)를 선택하고 다시 제출해 주세요.",
          }
        : null;
    if (!msg) {
      skipped += 1;
      continue;
    }
    try {
      // 앱을 설치하지 않은 기사는 기기가 없어 0 이 돌아온다 → 건너뜀으로 센다.
      if ((await sendAssignmentPushToInstaller(r.id, msg)) > 0) sent += 1;
      else skipped += 1;
    } catch (error) {
      console.error("[settlement-info/remind]", r.id, error);
      skipped += 1;
    }
  }
  return { sent, skipped: skipped + (ids.length - rows.length) };
}
