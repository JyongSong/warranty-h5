import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/cj/order-push/route";
import { saveCjOrderPush } from "@/lib/installation/cj/cj-order-push";

vi.mock("@/lib/cron/status", () => ({
  CJ_ORDER_PUSH_JOB: { key: "cj.orderPush" },
  recordCronJobCalled: vi.fn(),
  recordCronJobFinished: vi.fn(),
}));

vi.mock("@/lib/installation/cj/cj-order-push", () => ({
  CJ_ORDER_PUSH_MAX_ROWS: 5000,
  saveCjOrderPush: vi.fn(),
}));

const SECRET = "s".repeat(40);
const saveMock = vi.mocked(saveCjOrderPush);

function req(body: unknown, auth = `Bearer ${SECRET}`) {
  return new Request("https://x/api/internal/cj/order-push", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/internal/cj/order-push", () => {
  beforeEach(() => {
    process.env.CJ_ORDER_PUSH_SECRET = SECRET;
    delete process.env.CJ_ITEM_CODES;
    saveMock.mockReset();
    saveMock.mockResolvedValue({
      receivedRows: 1,
      uniqueOrderNos: 1,
      insertedCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      skippedOtherItems: 0,
      uploadId: "up1",
    });
  });

  it("비밀값이 틀리거나 없으면 401", async () => {
    expect((await POST(req({}, "Bearer wrong"))).status).toBe(401);
    process.env.CJ_ORDER_PUSH_SECRET = "";
    expect((await POST(req({}, "Bearer "))).status).toBe(401);
    // 너무 짧은 비밀값은 설정 안 된 것으로 본다
    process.env.CJ_ORDER_PUSH_SECRET = "short";
    expect((await POST(req({}, "Bearer short"))).status).toBe(401);
  });

  it("본문이 이상하면 400", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ startDate: "2026-11-01", endDate: "x", rows: [] }))).status).toBe(400);
    expect((await POST(req({ startDate: "2026-11-01", endDate: "2026-11-02", rows: "x" }))).status).toBe(400);
  });

  it("허용 필드만 넘기고 개인정보는 버린다", async () => {
    const response = await POST(
      req({
        startDate: "2026-10-31",
        endDate: "2026-11-06",
        rows: [
          {
            orderNo: "20261101000001",
            orderItemSequence: "001",
            orderDetailSequence: "001",
            orderProcessingSequence: "001",
            paymentDate: "2026-11-01 10:00:00",
            itemCode: 2093860797,
            ordererName: "홍길동",
            address: "서울",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith({
      rows: [
        {
          orderNo: "20261101000001",
          orderItemSequence: "001",
          orderDetailSequence: "001",
          orderProcessingSequence: "001",
          paymentDate: "2026-11-01 10:00:00",
          itemCode: "2093860797",
        },
      ],
      itemCodes: ["2093860797"],
      label: "CJ API 출고일 2026-10-31 ~ 2026-11-06",
    });
    expect(await response.json()).toMatchObject({ ok: true, insertedCount: 1 });
  });

  it("저장 실패면 500", async () => {
    saveMock.mockRejectedValue(new Error("db down"));
    const response = await POST(req({ startDate: "2026-10-31", endDate: "2026-11-06", rows: [] }));
    expect(response.status).toBe(500);
  });
});
