import { describe, expect, it, vi } from "vitest";
import { completionCaseResult, getPublicWallpadCompatData, recordCompletionWallpadCase } from "./service";

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
vi.mock("@/lib/piiCrypto", () => ({ decryptNullablePii: (v: string | null | undefined) => v ?? null }));

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

describe("완료 등록 → 현장 사례 결과", () => {
  it("성공·실패는 그대로, 옛 제출은 월패드 연동 체크가 있으면 성공", () => {
    expect(completionCaseResult({ wallpadResult: "FAIL", wallpadLinked: false })).toBe("FAIL");
    expect(completionCaseResult({ wallpadResult: "SUCCESS", wallpadLinked: true })).toBe("SUCCESS");
    expect(completionCaseResult({ wallpadResult: null, wallpadLinked: true })).toBe("SUCCESS");
    expect(completionCaseResult({ wallpadResult: null, wallpadLinked: false })).toBeNull();
    expect(completionCaseResult({ wallpadResult: "NOT_ATTEMPTED", wallpadLinked: false })).toBeNull();
  });

  it("옛 제출(연동 체크·금액만 있음)을 승인하면 성공 사례로 남긴다", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "case-1" });
    const tx = {
      installationOrder: {
        findUnique: vi.fn().mockResolvedValue({
          completion: {
            wallpadResult: null,
            wallpadLinked: true,
            wallpadBrand: null,
            wallpadModel: null,
            wallpadFailReason: null,
            wallpadNote: null,
            installEndAt: new Date("2026-10-30T05:00:00Z"),
          },
          activeCustomerRequest: {
            installAddressEncrypted: "경기 평택시 용죽1로 10 301동 1203호 (용이동, 평택센트럴자이3단지)",
            installAddress1Encrypted: null,
          },
          source: null,
        }),
      },
      wallpadSiteCase: { upsert, deleteMany: vi.fn() },
    };

    await recordCompletionWallpadCase(tx as never, "order-1");

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { installationOrderId: "order-1" },
        create: expect.objectContaining({
          result: "SUCCESS",
          source: "COMPLETION",
          siteName: "평택센트럴자이3단지",
          siteAddress: "경기 평택시 용죽1로 10",
          occurredOn: "2026-10-30",
        }),
      }),
    );
    expect(tx.wallpadSiteCase.deleteMany).not.toHaveBeenCalled();
  });
});
