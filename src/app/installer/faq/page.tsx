import Link from "next/link";
import type { CSSProperties } from "react";
import { requireInstallerPage } from "@/lib/installer/session";
import { INSTALL_FAQ, INSTALLER_NOTICE } from "@/lib/installer/notice";
import FeeSections from "../FeeSections";
import * as ui from "../ui";

export const dynamic = "force-dynamic";

// 자주 묻는 질문 화면: 설치비 기준 공지 전문 + 질문/답. 공지 팝업의 "자세히 보기", 작업 상세의 「이 건 안내」,
// 내 정보에서 들어온다. 문안은 src/lib/installer/notice.ts 에서 고친다.
export default async function InstallerFaqPage() {
  await requireInstallerPage("/installer/faq");

  return (
    <main style={ui.page}>
      <div style={ui.panel}>
        <Link href="/installer/me" style={backLink}>
          ← 내 정보
        </Link>
        <h1 style={ui.h1}>자주 묻는 질문</h1>
        <p style={ui.sub}>설치비 기준과 기사님들이 자주 물어보시는 내용입니다. 현장 방문 전에 확인해 주세요.</p>

        <section style={ui.card} aria-labelledby="faq-fee-title">
          <h2 id="faq-fee-title" style={sectionTitle}>
            {INSTALLER_NOTICE.title}
          </h2>
          <div style={effectiveBadge}>{INSTALLER_NOTICE.effective}</div>
          <FeeSections />
        </section>

        <section aria-labelledby="faq-qa-title">
          <h2 id="faq-qa-title" style={{ ...sectionTitle, margin: "20px 0 10px" }}>
            궁금한 점 (눌러서 답 보기)
          </h2>
          {INSTALL_FAQ.map((item) => (
            <details key={item.q} style={qaCard}>
              <summary style={qaSummary}>{item.q}</summary>
              <p style={qaAnswer}>{item.a}</p>
            </details>
          ))}
        </section>

        <p style={footNote}>위 내용으로 해결되지 않으면 본사 담당자에게 문의해 주세요.</p>
      </div>
    </main>
  );
}

const backLink: CSSProperties = {
  display: "inline-block",
  color: "#52525b",
  fontSize: 14,
  fontWeight: 600,
  padding: "4px 0",
  marginBottom: 8,
  textDecoration: "none",
};

const sectionTitle: CSSProperties = { fontSize: 17, fontWeight: 800, margin: 0 };

const effectiveBadge: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  background: "#fef3c7",
  color: "#92400e",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 700,
};





const qaCard: CSSProperties = { ...ui.card, padding: "12px 14px", marginBottom: 8 };

const qaSummary: CSSProperties = { fontSize: 15, fontWeight: 700, cursor: "pointer", lineHeight: 1.5 };

const qaAnswer: CSSProperties = { fontSize: 14, lineHeight: 1.65, color: "#3f3f46", margin: "8px 0 0" };

const footNote: CSSProperties = { fontSize: 12, color: "#a1a1aa", lineHeight: 1.6, marginTop: 16 };
