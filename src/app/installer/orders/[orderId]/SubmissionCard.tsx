"use client";

import type { CSSProperties } from "react";
import type { InstallationCompletionView } from "@/lib/installation/completion/service";
import { WALLPAD_FAIL_REASON_LABEL, type WallpadFailReason } from "@/lib/installation/wallpad/constants";
import SubmittedPhotos from "../../SubmittedPhotos";
import { formatKst } from "../../formatKst";
import * as ui from "../../ui";

const CAP_LABEL: Record<string, string> = {
  NONE: "연동 안 함",
  DOORLOCK_AND_APP: "APP 연동",
  DOORLOCK_AND_APP_AND_HUB: "허브 연동 (APP 포함)",
};

const won = (n: number) => `${n.toLocaleString()}원`;

// 완료 등록 때 기사가 입력한 내용을 그대로 보여 준다 (읽기 전용).
// 장거리·기타 청구·기본 출장비는 본사 승인 때 금액이 확정되며 같은 칸에 덮어쓰이므로,
// 승인 전에는 "신청", 승인 후에는 "확정" 으로 구분해 적는다.
export default function SubmissionCard({ completion }: { completion: InstallationCompletionView }) {
  const approved = completion.reviewStatus === "APPROVED";
  const amountTag = approved ? "확정" : "신청";
  const agentProxy = completion.agentProxyBaseFee !== null;
  const review = reviewBadge(completion.reviewStatus);

  return (
    <section style={ui.card} aria-labelledby="submission-title">
      <div style={header}>
        <h2 id="submission-title" style={title}>
          제출한 완료 내용
        </h2>
        <span style={ui.badge(review.bg, review.color)}>{review.text}</span>
      </div>

      <Row label="설치 종료" value={formatKst(completion.installEndAt)} />
      <Row label="제출 시각" value={formatKst(completion.submittedAt)} />

      {agentProxy ? (
        <>
          <Row label="실제 시공자" value={completion.actualInstaller || "미입력"} />
          <Row label={`기본 출장비 (${amountTag})`} value={won(completion.agentProxyBaseFee ?? 0)} />
        </>
      ) : (
        <>
          <Row
            label="앱/허브 연동"
            value={CAP_LABEL[completion.achievedAqaraAppCapability] ?? completion.achievedAqaraAppCapability}
          />
          <Row label="월패드" value={wallpadLines(completion).join("\n")} />
          <Row
            label={`장거리 (${amountTag})`}
            value={completion.longDistanceAmount ? won(completion.longDistanceAmount) : "없음"}
          />
        </>
      )}

      {completion.extraClaimAmount != null || completion.extraClaimReason ? (
        <>
          <Row
            label={`기타 청구 (${amountTag})`}
            value={completion.extraClaimAmount ? won(completion.extraClaimAmount) : approved ? "인정 안 됨" : "0원"}
          />
          {completion.extraClaimReason ? <Row label="청구 사유" value={completion.extraClaimReason} /> : null}
        </>
      ) : null}

      <SubmittedPhotos title="설치 사진" photos={completion.photos} />
      <SubmittedPhotos title="연동 화면 사진" photos={completion.linkagePhotos} />
      <SubmittedPhotos title="월패드 사진" photos={completion.wallpadPhotos} />
      <SubmittedPhotos title="기타 청구 증빙" photos={completion.extraClaimPhotos} />
    </section>
  );
}

/** 월패드 칸. 결과 항목이 없는 옛 제출은 연동 여부만 있다. */
function wallpadLines(c: InstallationCompletionView): string[] {
  const device = [c.wallpadBrand, c.wallpadModel].filter(Boolean).join(" ");
  const billing =
    c.wallpadBilling === "HQ"
      ? "본사 청구"
      : c.wallpadBilling === "ONSITE" || c.wallpadAmount
        ? `현장 결제${c.wallpadAmount ? ` ${won(c.wallpadAmount)}` : ""}`
        : null;

  if (c.wallpadResult === "SUCCESS" || (!c.wallpadResult && c.wallpadLinked)) {
    return ["연동 성공", device, billing].filter((v): v is string => !!v);
  }
  if (c.wallpadResult === "FAIL") {
    const reason = c.wallpadFailReason
      ? (WALLPAD_FAIL_REASON_LABEL[c.wallpadFailReason as WallpadFailReason] ?? c.wallpadFailReason)
      : null;
    return [
      "시도했지만 실패",
      device,
      reason ? `사유: ${reason}` : null,
      c.wallpadNote ? `메모: ${c.wallpadNote}` : null,
    ].filter((v): v is string => !!v);
  }
  return ["연동 안 함"];
}

function reviewBadge(status: string): { text: string; bg: string; color: string } {
  if (status === "APPROVED") return { text: "승인", bg: "#d1fae5", color: "#065f46" };
  if (status === "REJECTED") return { text: "반려", bg: "#fee2e2", color: "#991b1b" };
  return { text: "검수 대기", bg: "#dbeafe", color: "#1e40af" };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 8, padding: "5px 0" }}>
      <div style={ui.rowLabel}>{label}</div>
      <div style={{ ...ui.rowValue, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

const title: CSSProperties = { fontSize: 15, fontWeight: 800, margin: 0 };
