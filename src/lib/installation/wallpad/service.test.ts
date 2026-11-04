import { describe, expect, it, vi } from "vitest";
import { getPublicWallpadCompatData } from "./service";

const { caseRow } = vi.hoisted(() => {
  const now = new Date("2026-11-04T00:00:00Z");
  return {
    caseRow: {
      brand: "코콤",
      model: "KHN-Q100LT",
      result: "SUCCESS",
      failReason: null,
      occurredOn: "2026-11-04",
      createdAt: now,
      updatedAt: now,
      createdByAdminId: null,
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wallpadModel: { findMany: vi.fn().mockResolvedValue([]) },
    wallpadCompatNote: { findMany: vi.fn().mockResolvedValue([]) },
    wallpadSiteCase: {
      findMany: vi.fn().mockResolvedValue([
        {
          ...caseRow,
          id: "c1",
          siteName: "평택센트럴자이3단지",
          siteKey: "경기평택시용죽1로10",
          siteAddress: "경기 평택시 용죽1로 10",
          note: "1203호 고객님 부재로 다음 날 시공",
          source: "COMPLETION",
          sourceUrl: null,
          installationOrderId: "order-1",
        },
        {
          ...caseRow,
          id: "c2",
          siteName: "평택센트럴자이 3단지",
          siteKey: "경기평택시용죽1로10",
          siteAddress: "경기 평택시 용죽1로 10",
          note: null,
          source: "COMPLETION",
          sourceUrl: null,
          installationOrderId: "order-2",
        },
        {
          ...caseRow,
          id: "c3",
          siteName: "용인 롯데캐슬 클라시에",
          siteKey: null,
          siteAddress: null,
          note: "현장 제보",
          source: "IMPORT",
          sourceUrl: "https://example.com/report",
          installationOrderId: null,
        },
      ]),
    },
  },
}));
vi.mock("@/lib/installation/distance/naver", () => ({ geocodeBuildingName: vi.fn() }));

describe("getPublicWallpadCompatData", () => {
  it("공개 화면에는 주소·주문 연결·완료 등록 메모를 내보내지 않는다", async () => {
    const { cases } = await getPublicWallpadCompatData();
    const json = JSON.stringify(cases);

    expect(json).not.toContain("용죽1로");
    expect(json).not.toContain("order-");
    expect(json).not.toContain("1203호");
    expect(cases.every((c) => c.siteAddress === null && c.installationOrderId === null)).toBe(true);
  });

  it("같은 단지 묶음은 유지하되 키는 주소가 아닌 순번이다", async () => {
    const { cases } = await getPublicWallpadCompatData();
    expect(cases[0].siteKey).toBe("site-1");
    expect(cases[1].siteKey).toBe("site-1");
    expect(cases[2].siteKey).toBeNull();
  });

  it("기존 자료의 메모와 근거 링크는 그대로 보여 준다", async () => {
    const { cases } = await getPublicWallpadCompatData();
    expect(cases[2]).toMatchObject({ note: "현장 제보", sourceUrl: "https://example.com/report" });
  });
});
