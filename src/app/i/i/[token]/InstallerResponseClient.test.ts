import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseProductSummaryItems } from "./product-summary";

describe("parseProductSummaryItems", () => {
  it("splits source items JSON product summary into display rows", () => {
    expect(
      parseProductSummaryItems("용역 도어락 설치비(K100) x1 / 월패드 연동(RF447) x2"),
    ).toEqual([
      { name: "용역 도어락 설치비(K100)", quantity: 1 },
      { name: "월패드 연동(RF447)", quantity: 2 },
    ]);
  });

  it("keeps a legacy memo summary as one display row", () => {
    expect(parseProductSummaryItems("[잇섭PICK_앱 설치] 제품 메모")).toEqual([
      { name: "[잇섭PICK_앱 설치] 제품 메모", quantity: 1 },
    ]);
  });
});

describe("InstallerResponseClient response UI", () => {
  const source = readFileSync(join(__dirname, "InstallerResponseClient.tsx"), "utf8");

  it("keeps rejection reasons inside the confirmation modal instead of the response section", () => {
    const responseSection = source.slice(
      source.indexOf("function ResponseSection"),
      source.indexOf("function ConfirmModal"),
    );
    const confirmModal = source.slice(source.indexOf("function ConfirmModal"));

    expect(responseSection).toContain("배정 수락");
    expect(responseSection).toContain("배정 거절");
    expect(responseSection).not.toContain("거절 사유");
    expect(confirmModal).toContain("거절 사유");
    expect(confirmModal).toContain("rejectionReasons.map");
  });

  it("only renders the response section while the assignment is pending", () => {
    const shouldShowResponseSection = source.slice(
      source.indexOf("function shouldShowResponseSection"),
      source.indexOf("export default function InstallerResponseClient"),
    );

    expect(shouldShowResponseSection).toContain('return status === "pending";');
    expect(shouldShowResponseSection).not.toContain('status === "expired"');
    expect(source).not.toContain("이 배정 요청은 현재 응답할 수 없는 상태입니다.");
  });

  it("shows the 24-hour response deadline with date and minute precision", () => {
    expect(source).toContain("function formatResponseDeadline");
    expect(source).toContain('timeZone: "Asia/Seoul"');
    expect(source).toContain('minute: "2-digit"');
    expect(source).not.toContain('second: "2-digit"');
    expect(source).toContain("const dayPeriod = numericHour < 12 ? \"오전\" : \"오후\";");
    expect(source).not.toContain("valueByType.get(\"dayPeriod\")");
    expect(source).toContain("문자 수신 후 24시간 (${year}.${month}.${day} ${dayPeriod} ${displayHour}:${minute})");
  });

  it("uses a stable unique product row key even when item names repeat", () => {
    expect(source).toContain("detail.productItems.map((item, index)");
    expect(source).toContain("key={`${item.name}-${index}`}");
  });
});
