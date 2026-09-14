import { describe, expect, it } from "vitest";
import { parseIotPassPatch, parseIotPassPayload, serializeIotPass } from "./iotPass";

describe("parseIotPassPayload (새 IoT Pass)", () => {
  it("빠진 항목을 기본값으로 채우고 SN 을 대문자로 맞춘다", () => {
    const data = parseIotPassPayload({ sn: " a01460abc " });

    expect(data.sn).toBe("A01460ABC");
    expect(data.purchase_status).toBe("pending");
    expect(data.feature_code).toBe("zigbee");
    expect(data.payment_provider).toBe("manual");
    expect(data.contact).toBeNull();
    expect(data.paid_at).toBeNull();
    expect(data.last_hub_bound_at).toBeNull();
  });

  it("SN 을 요구하고 모르는 결제 상태와 잘못된 날짜를 막는다", () => {
    expect(() => parseIotPassPayload({ sn: "  " })).toThrow("SN 을 입력해 주세요.");
    expect(() => parseIotPassPayload({ sn: "A1", purchaseStatus: "refunded" })).toThrow(
      "결제 상태 값이 올바르지 않습니다.",
    );
    expect(() => parseIotPassPayload({ sn: "A1", paidAt: "어제" })).toThrow(
      "날짜 형식이 올바르지 않습니다.",
    );
  });
});

describe("parseIotPassPatch (기존 IoT Pass 수정)", () => {
  it("보낸 항목만 반영한다", () => {
    const data = parseIotPassPatch({ purchaseStatus: "paid" });

    // updated_at 은 이 표에 @updatedAt 이 없어서 직접 채운다.
    expect(Object.keys(data).sort()).toEqual(["purchase_status", "updated_at"]);
    expect(data.purchase_status).toBe("paid");
    expect(data.updated_at).toBeInstanceOf(Date);
  });

  it("보내지 않은 항목은 아예 넣지 않는다", () => {
    // cafe24 웹훅이 채운 결제 이력을 백오피스 저장이 조용히 지우면 안 된다.
    const data = parseIotPassPatch({ contact: "01012345678" });

    expect("paid_at" in data).toBe(false);
    expect("payment_provider" in data).toBe(false);
    expect("purchase_status" in data).toBe(false);
  });

  it("빈 문자열로 보낸 날짜는 지우라는 뜻으로 본다", () => {
    expect(parseIotPassPatch({ paidAt: "" }).paid_at).toBeNull();
  });
});

describe("serializeIotPass", () => {
  const row = {
    id: "row-1",
    sn: "A01460ABC",
    contact: null,
    purchase_status: "paid",
    feature_code: "zigbee",
    payment_provider: "cafe24",
    paid_at: new Date("2026-09-01T00:00:00.000Z"),
    last_hub_bound_at: null,
    created_at: new Date("2026-08-31T00:00:00.000Z"),
    updated_at: new Date("2026-09-01T00:00:00.000Z"),
  };

  it("출고 기기를 찾았는지 표시한다", () => {
    expect(serializeIotPass(row, { model: "L100 SE" })).toMatchObject({
      deviceModel: "L100 SE",
      shipped: true,
      paidAt: "2026-09-01T00:00:00.000Z",
    });

    expect(serializeIotPass(row, null)).toMatchObject({ deviceModel: null, shipped: false });
  });
});
