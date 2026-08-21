import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { getInstallerContact } from "@/lib/installation/installer/source";
import { logoutInstallerAction } from "../actions";
import { Row } from "../cards";
import { formatKrPhone } from "@/lib/phone";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

export default async function InstallerMePage() {
  const installer = await requireInstallerPage("/installer/me");
  // 세션에는 id/name 만 있어 지점·연락처는 등록부에서 읽는다.
  const profile = await getInstallerContact(installer.id).catch(() => null);

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

        <Link href="/installer/guide" style={guideLink}>
          앱 사용 안내 다시 보기
        </Link>

        <form action={logoutInstallerAction} style={{ marginTop: 8 }}>
          <button type="submit" style={ui.secondaryButton}>
            로그아웃
          </button>
        </form>

        <p style={footNote}>
          정보 수정이 필요하시면 본사 담당자에게 문의해 주세요.
        </p>
      </div>
    </main>
  );
}

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
