import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const getAuthPartner = vi.fn();
const listCjManifestEntriesForExport = vi.fn();

vi.mock("@/lib/partnerAuth", () => ({ getAuthPartner }));
vi.mock("@/lib/installation/cj/manifest", () => ({ listCjManifestEntriesForExport }));

const { GET } = await import("./route");

function request(query: string) {
  return new Request(`http://localhost/partner/cj/export?${query}`) as never;
}

beforeEach(() => {
  getAuthPartner.mockReset();
  listCjManifestEntriesForExport.mockReset();
});

describe("GET /partner/cj/export", () => {
  it("CJ 로그인이 아니면 401", async () => {
    getAuthPartner.mockResolvedValue({ partnerCode: "PL" });
    const res = await GET(request("status=ALL"));
    expect(res.status).toBe(401);
    expect(listCjManifestEntriesForExport).not.toHaveBeenCalled();
  });

  it("조건을 넘기고 주문번호를 문자열 그대로 엑셀에 담는다", async () => {
    getAuthPartner.mockResolvedValue({ partnerCode: "CJ" });
    listCjManifestEntriesForExport.mockResolvedValue({
      truncated: false,
      entries: [
        {
          id: "1",
          orderNo: "20261118111539001001001",
          orderDate: "2026-11-18",
          createdAt: new Date("2026-11-20T08:15:00Z"),
          consumedAt: new Date("2026-11-23T09:44:00Z"),
        },
        { id: "2", orderNo: "20261118095788001001001", orderDate: null, createdAt: new Date("2026-11-19T08:15:00Z"), consumedAt: null },
      ],
    });

    const res = await GET(request("dateField=consumedAt&dateFrom=2026-11-01&dateTo=2026-11-30&status=bogus&query=2026"));

    expect(res.status).toBe(200);
    expect(listCjManifestEntriesForExport).toHaveBeenCalledWith({
      query: "2026",
      dateField: "consumedAt",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
      status: "ALL",
    });
    expect(decodeURIComponent(res.headers.get("Content-Disposition") ?? "")).toContain("CJ_주문번호_전체_20261101-20261130_");

    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.A2).toMatchObject({ t: "s", v: "20261118111539001001001" });
    expect(XLSX.utils.sheet_to_json(ws)).toEqual([
      { 주문번호: "20261118111539001001001", 주문일: "2026-11-18", 등록일시: "2026-11-20 17:15", 상태: "접수 완료", 접수일시: "2026-11-23 18:44" },
      { 주문번호: "20261118095788001001001", 주문일: "", 등록일시: "2026-11-19 17:15", 상태: "미접수", 접수일시: "" },
    ]);
  });
});
