import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerContact } from "@/lib/installation/installer/source";
import { logoutInstallerAction } from "../actions";
import { Row } from "../cards";
import { formatKrPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { isSettlementLaunched } from "@/lib/installation/settlement/statements";
import { isPopbillTaxInvoiceEnabled } from "@/lib/installer/popbill-tax-invoice";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

export default async function InstallerMePage() {
  const installer = await requireInstallerPage("/installer/me");
  // 세션에는 id/name 만 있어 지점·연락처는 등록부에서 읽는다.
  const profile = await getInstallerContact(installer.id).catch(() => null);
  // 정산 기능 공개 전에는 「정산 정보 등록」 입구를 숨긴다.
  const settlementLaunched = await isSettlementLaunched().catch(() => false);
  const settlementInfo = await prisma.installerSettlementInfo
    .findUnique({ where: { installerId: installer.id }, select: { status: true } })
    .catch(() => null);
  const settlementStatus = settlementInfo ? SETTLEMENT_STATUS[settlementInfo.status] : SETTLEMENT_STATUS.NONE;
  // 팝빌 전자세금계산서 공개 전에는 「전자세금계산서 연동」 입구를 숨긴다.
  const popbillEnabled = await isPopbillTaxInvoiceEnabled().catch(() => false);
  const popbillLink = popbillEnabled
    ? await prisma.installerPopbillLink
        .findUnique({ where: { installerId: installer.id }, select: { status: true } })
        .catch(() => null)
    : null;
  const popbillStatus = popbillLink?.status === "READY" ? POPBILL_STATUS.READY : POPBILL_STATUS.NONE;

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ ...ui.h1, marginBottom: 2 }}>내 정보</h1>
          <div style={{ fontSize: 13, color: "#71717a" }}>{installer.name} 기사님</div>
        </div>

        <div style={ui.card}>
          <Row label="이름" value={profile?.name ?? installer.name} />
          <Row label="연락처" value={profile?.phone ? formatKrPhone(profile.phone) : "-"} />
          <Row label="지점" value={profile?.branch?.trim() || "-"} />
          <Row label="지역" value={profile?.region?.trim() || "-"} />
        </div>

        <Link href="/installer/me/edit" style={primaryLink}>
          내 정보 확인·수정
        </Link>

        {settlementLaunched ? (
          <Link href="/installer/me/settlement-info" style={settlementLink}>
            <span>정산 정보 등록</span>
            <span style={ui.badge(settlementStatus.bg, settlementStatus.color)}>{settlementStatus.text}</span>
          </Link>
        ) : null}

        {popbillEnabled ? (
          <Link href="/installer/me/tax-invoice" style={settlementLink}>
            <span>전자세금계산서 연동</span>
            <span style={ui.badge(popbillStatus.bg, popbillStatus.color)}>{popbillStatus.text}</span>
          </Link>
        ) : null}

        <Link href="/installer/faq" style={guideLink}>
          자주 묻는 질문 · 설치비 기준
        </Link>

        <Link href="/installer/guide" style={guideLink}>
          앱 사용 안내 다시 보기
        </Link>

        <form action={logoutInstallerAction} style={{ marginTop: 8 }}>
          <button type="submit" style={ui.secondaryButton}>
            로그아웃
          </button>
        </form>

        <p style={footNote}>
          이름·주소·연동 능력·A/S 긴급출동은 위 버튼에서 직접 수정하실 수 있습니다.
          담당 지역과 설치 가능 항목 변경은 본사 담당자에게 문의해 주세요.
        </p>
      </div>
    </main>
  );
}

const primaryLink: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 50,
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
  marginTop: 8,
};

const SETTLEMENT_STATUS: Record<string, { text: string; bg: string; color: string }> = {
  NONE: { text: "미등록", bg: "#fee2e2", color: "#991b1b" },
  SUBMITTED: { text: "확인 중", bg: "#fef3c7", color: "#92400e" },
  APPROVED: { text: "승인", bg: "#d1fae5", color: "#065f46" },
  REJECTED: { text: "반려", bg: "#fee2e2", color: "#991b1b" },
};

const POPBILL_STATUS = {
  NONE: { text: "미연동", bg: "#f4f4f5", color: "#52525b" },
  READY: { text: "연동 완료", bg: "#d1fae5", color: "#065f46" },
};

const settlementLink: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 16px",
  textDecoration: "none",
  marginTop: 8,
  boxSizing: "border-box",
};

const guideLink: CSSProperties = {
  ...ui.secondaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  marginTop: 8,
};

const footNote: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  lineHeight: 1.6,
  marginTop: 16,
};
