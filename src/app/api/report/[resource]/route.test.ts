import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/report/[resource]/route";

const fetchOrders = vi.fn();

vi.mock("@/lib/report/resources", () => ({
  REPORT_RESOURCES: { "installation-orders": (q: unknown) => fetchOrders(q) },
}));

const KEY = "r".repeat(40);

function call(path: string, auth: string | null = `Bearer ${KEY}`) {
  const resource = path.split("?")[0];
  const req = new Request(`https://x/api/report/${path}`, {
    headers: auth ? { authorization: auth } : {},
  });
  return GET(req, { params: Promise.resolve({ resource }) });
}

describe("GET /api/report/[resource]", () => {
  beforeEach(() => {
    process.env.REPORT_API_KEY = KEY;
    fetchOrders.mockReset();
    fetchOrders.mockResolvedValue({ rows: [{ id: "o1", customer_name: "홍길동" }], total: 1 });
  });

  it("키가 없거나 틀리면 401 이고 데이터를 읽지 않는다", async () => {
    expect((await call("installation-orders", null)).status).toBe(401);
    expect((await call("installation-orders", "Bearer nope")).status).toBe(401);
    expect(fetchOrders).not.toHaveBeenCalled();
  });

  it("없는 리소스는 404", async () => {
    expect((await call("users")).status).toBe(404);
    expect((await call("__proto__")).status).toBe(404);
  });

  it("잘못된 파라미터는 400", async () => {
    expect((await call("installation-orders?page_size=5000")).status).toBe(400);
  });

  it("JSON: 페이지 정보와 데이터", async () => {
    const res = await call("installation-orders?page=1&page_size=10");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-total-count")).toBe("1");
    expect(await res.json()).toEqual({
      resource: "installation-orders",
      total: 1,
      page: 1,
      page_size: 10,
      data: [{ id: "o1", customer_name: "홍길동" }],
    });
  });

  it("CSV: BOM 붙은 첨부 파일", async () => {
    const res = await call("installation-orders?format=csv");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("installation-orders.csv");
    // res.text() 는 디코딩하면서 BOM 을 떼므로 바이트로 확인한다 (Excel 은 BOM 이 있어야 한글을 읽는다)
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("id,customer_name\r\no1,홍길동\r\n");
  });

  it("복호화 실패 수를 헤더로 알려 준다", async () => {
    fetchOrders.mockResolvedValue({ rows: [], total: 0, piiDecryptFailures: 3 });
    const res = await call("installation-orders");
    expect(res.headers.get("x-pii-decrypt-failures")).toBe("3");
  });

  it("조회 실패는 500 이고 내부 메시지를 내보내지 않는다", async () => {
    fetchOrders.mockRejectedValue(new Error("db password wrong"));
    const res = await call("installation-orders");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("password");
  });
});
