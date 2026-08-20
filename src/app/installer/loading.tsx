import type { CSSProperties } from "react";
import * as ui from "./ui";

// 탭 전환 시 즉시 뜨는 뼈대 화면.
// 서버 렌더가 끝날 때까지 화면이 멈춰 있으면 "눌러도 반응이 없다"고 느끼게 된다.
// 이 파일이 있어야 Next 가 dynamic 라우트의 외곽을 미리 받아두기도 한다.
export default function InstallerLoading() {
  return (
    <main style={ui.page}>
      <div style={ui.panel} aria-busy="true" aria-label="불러오는 중">
        <div style={{ ...bar, width: 96, height: 24, marginBottom: 6 }} />
        <div style={{ ...bar, width: 120, height: 14, marginBottom: 22 }} />

        <div style={{ ...bar, width: 72, height: 14, marginBottom: 10 }} />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  );
}

function SkeletonCard() {
  return (
    <div style={ui.card}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ ...bar, width: 64, height: 20, borderRadius: 999 }} />
        <div style={{ ...bar, width: 80, height: 14 }} />
      </div>
      <div style={{ ...bar, width: "70%", height: 16, marginBottom: 12 }} />
      <div style={{ ...bar, width: "55%", height: 13, marginBottom: 8 }} />
      <div style={{ ...bar, width: "85%", height: 13 }} />
    </div>
  );
}

const bar: CSSProperties = {
  background: "#e4e4e7",
  borderRadius: 6,
};
