import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOrderDetails } from "@/lib/cafe24";
import { prisma } from "@/lib/prisma";
import { cafe24SecretMatches } from "./handler";
import { POST as postRoot } from "./route";
import { POST as postWithKey } from "./[key]/route";

vi.mock("@/lib/cafe24", () => ({
  fetchOrderDetails: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    device_feature_upgrades: {
      upsert: vi.fn(),
    },
  },
}));

const fetchOrderDetailsMock = vi.mocked(fetchOrderDetails);
const upsertMock = vi.mocked(prisma.device_feature_upgrades.upsert);

const WEBHOOK_URL = "https://www.aqaralife-service.kr/api/cafe24/webhook";
const SECRET = "test-webhook-secret";

function paidOrderPayload() {
  return {
    event: "order.paid",
    resource_id: "20260101-0000001",
    mall_id: "aqarakr",
  };
}

function paidOrder() {
  return {
    paid: "T",
    buyer: { cellphone: "01011112222", email: "buyer@example.com" },
    items: [
      {
        product_code: "P00000SE",
        additional_option_value: "기기 SN=a0146012345",
      },
    ],
  };
}

function webhookRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("cafe24SecretMatches", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips verification (allows) when CAFE24_WEBHOOK_SECRET is not set", () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", "");
    expect(cafe24SecretMatches(null)).toBe(true);
    expect(cafe24SecretMatches("anything")).toBe(true);
  });

  it("rejects when secret is set but nothing is provided", () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);
    expect(cafe24SecretMatches(null)).toBe(false);
    expect(cafe24SecretMatches("")).toBe(false);
  });

  it("accepts a matching secret and rejects a wrong one", () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);
    expect(cafe24SecretMatches(SECRET)).toBe(true);
    expect(cafe24SecretMatches("wrong")).toBe(false);
  });
});

describe("POST /api/cafe24/webhook/[key] (path-segment secret — production entry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and does not touch Cafe24/DB when the path key is wrong", async () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);

    const response = await postWithKey(
      webhookRequest(`${WEBHOOK_URL}/wrong`, paidOrderPayload()),
      { params: Promise.resolve({ key: "wrong" }) },
    );

    expect(response.status).toBe(401);
    expect(fetchOrderDetailsMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("activates the device SN for a valid paid order when the path key matches", async () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);
    fetchOrderDetailsMock.mockResolvedValue(paidOrder() as never);
    upsertMock.mockResolvedValue({} as never);

    const response = await postWithKey(
      webhookRequest(`${WEBHOOK_URL}/${SECRET}`, paidOrderPayload()),
      { params: Promise.resolve({ key: SECRET }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, activated: 1 });
    expect(fetchOrderDetailsMock).toHaveBeenCalledWith("aqarakr", "20260101-0000001");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    // SN is normalized to upper case before persisting
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ where: { sn: "A0146012345" } });
  });
});

describe("POST /api/cafe24/webhook (query/header secret — compatibility entry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when the key is missing", async () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);

    const response = await postRoot(webhookRequest(WEBHOOK_URL, paidOrderPayload()));

    expect(response.status).toBe(401);
    expect(fetchOrderDetailsMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("accepts a matching ?key= query and activates the order", async () => {
    vi.stubEnv("CAFE24_WEBHOOK_SECRET", SECRET);
    fetchOrderDetailsMock.mockResolvedValue(paidOrder() as never);
    upsertMock.mockResolvedValue({} as never);

    const response = await postRoot(
      webhookRequest(`${WEBHOOK_URL}?key=${SECRET}`, paidOrderPayload()),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, activated: 1 });
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
