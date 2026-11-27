import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const getAuthPartner = vi.fn();
const getInstallationPartnerByCode = vi.fn();
const getPartnerCompletedSummary = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/partnerAuth", () => ({ getAuthPartner }));
vi.mock("@/lib/installation/partner/service", () => ({ getInstallationPartnerByCode }));
vi.mock("@/lib/installation/partner/views", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/installation/partner/views")>();
  return { ...actual, getPartnerCompletedSummary };
});

const { GET } = await import("./route");

function request(query: string) {
  return new Request(`http://localhost/partner/orders/export?${query}`) as never;
}

beforeEach(() => {
  getAuthPartner.mockReset();
  getInstallationPartnerByCode.mockReset();
  getPartnerCompletedSummary.mockReset();
});

describe("GET /partner/orders/export", () => {
  it("PL 로그인이 아니면 401", async () => {
    getAuthPartner.mockResolvedValue({ partnerCode: "CJ" });
    const res = await GET(request("from=2026-11-01&to=2026-11-30"));
    expect(res.status).toBe(401);
    expect(getPartnerCompletedSummary).not.toHaveBeenCalled();
  });

  it("화면과 같은 기간으로 완료 내역과 합계 행을 낸다", async () => {
    getAuthPartner.mockResolvedValue({ partnerCode: "PL" });
    getInstallationPartnerByCode.mockResolvedValue({ id: "p1", name: "PL ENG", active: true });
    getPartnerCompletedSummary.mockResolvedValue({
      totalAmount: 80000,
      pendingReviewCount: 0,
      pendingReviewAmount: 0,
      orders: [
        {
          id: "o1",
          completedAt: new Date("2026-11-20T16:00:00Z"),
          orderNumber: "A-1",
          customerName: "홍길동",
          customerPhone: "01012345678",
          address: "서울 강남구 1",
          installItems: [{ name: "K100", quantity: 1, onsitePayment: false }],
          installer: "김기사",
          claimAmount: 80000,
        },
      ],
    });

    // 시작이 끝보다 늦으면 바꿔서 쓴다(화면과 같은 규칙).
    const res = await GET(request("from=2026-11-30&to=2026-11-01"));

    expect(res.status).toBe(200);
    expect(getPartnerCompletedSummary).toHaveBeenCalledWith("p1", { from: "2026-11-01", to: "2026-11-30" });
    expect(decodeURIComponent(res.headers.get("Content-Disposition") ?? "")).toContain("PL ENG_완료_20261101-20261130.xlsx");

    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["완료"], { header: 1 });
    expect(rows[1]).toEqual(["2026-11-21", "A-1", "홍길동", "010-1234-5678", "서울 강남구 1", "K100 ×1", "김기사", 80000]);
    expect(rows[2]).toEqual(["합계", "", "", "", "", "", "1건", 80000]);
  });
});
