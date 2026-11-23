import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { logoutInstallerAction } from "../actions";
import * as ui from "../ui";

export type MeBadge = { text: string; bg: string; color: string };

export type MeViewProps = {
  name: string;
  phone: string | null;
  branch: string | null;
  region: string | null;
  /** 정산 기능 공개 전이면 null → 「정산」 묶음을 숨긴다 */
  settlement: { infoBadge: MeBadge; popbillBadge: MeBadge | null } | null;
};

/**
 * 내 정보 화면. 기능별로 묶는다: 프로필 → 정산 → 도움말 → 로그아웃.
 * 데이터 읽기는 page.tsx 가 하고, 여기는 그리기만 한다.
 */
export default function MeView({ name, phone, branch, region, settlement }: MeViewProps) {
  const place = [branch, region].filter(Boolean).join(" · ");
  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <h1 style={{ ...ui.h1, marginBottom: 16 }}>내 정보</h1>

        <div style={{ ...ui.card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 16px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {name} <span style={{ fontSize: 14, fontWeight: 600, color: "#71717a" }}>기사님</span>
            </div>
            <div style={{ fontSize: 15, color: ui.TEXT, marginTop: 6 }}>{phone ?? "-"}</div>
            {place ? <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>{place}</div> : null}
          </div>
          <ListLink href="/installer/me/edit" topBorder>
            <span>내 정보 확인·수정</span>
          </ListLink>
        </div>
        <p style={caption}>이름·주소·연동 능력·A/S 긴급출동은 직접 수정할 수 있습니다.</p>

        {settlement ? (
          <Section title="정산">
            <ListLink href="/installer/me/settlement-info">
              <span>정산 정보 등록</span>
              <Badge b={settlement.infoBadge} />
            </ListLink>
            {settlement.popbillBadge ? (
              <ListLink href="/installer/me/tax-invoice" topBorder>
                <span>전자세금계산서 연동</span>
                <Badge b={settlement.popbillBadge} />
              </ListLink>
            ) : null}
          </Section>
        ) : null}

        <Section title="도움말">
          <ListLink href="/installer/faq">
            <span>자주 묻는 질문 · 설치비 기준</span>
          </ListLink>
          <ListLink href="/installer/guide" topBorder>
            <span>앱 사용 안내 다시 보기</span>
          </ListLink>
        </Section>
        <p style={caption}>담당 지역과 설치 가능 항목 변경은 본사 담당자에게 문의해 주세요.</p>

        <form action={logoutInstallerAction} style={{ marginTop: 24, textAlign: "center" }}>
          <button type="submit" style={logoutButton}>
            로그아웃
          </button>
        </form>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={sectionTitle}>{title}</h2>
      <div style={{ ...ui.card, padding: 0, overflow: "hidden", marginBottom: 0 }}>{children}</div>
    </section>
  );
}

function ListLink({ href, children, topBorder }: { href: string; children: ReactNode; topBorder?: boolean }) {
  return (
    <Link href={href} style={{ ...listRow, borderTop: topBorder ? `1px solid ${ui.BORDER}` : "none" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flex: 1, minWidth: 0 }}>
        {children}
      </span>
      <span aria-hidden style={chevron}>
        ›
      </span>
    </Link>
  );
}

function Badge({ b }: { b: MeBadge }) {
  return <span style={ui.badge(b.bg, b.color)}>{b.text}</span>;
}

const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#71717a",
  margin: "0 4px 8px",
};

const listRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 54,
  padding: "0 14px 0 16px",
  fontSize: 16,
  fontWeight: 600,
  color: ui.TEXT,
  textDecoration: "none",
  background: "#fff",
};

const chevron: CSSProperties = { fontSize: 22, color: "#a1a1aa", lineHeight: 1 };

const caption: CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  lineHeight: 1.6,
  margin: "8px 4px 0",
  wordBreak: "keep-all",
};

const logoutButton: CSSProperties = {
  background: "none",
  border: "none",
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 600,
  color: "#71717a",
  textDecoration: "underline",
  cursor: "pointer",
};
