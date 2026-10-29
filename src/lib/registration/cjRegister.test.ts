import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCjRegLinkToken } from "./cjRegLink";
import { registerByCjLink } from "./cjRegister";

const { regCount, regFindUnique, regCreate, regUpdate, shippedFindUnique, sendSmsMock } = vi.hoisted(() => ({
  regCount: vi.fn(),
  regFindUnique: vi.fn(),
  regCreate: vi.fn(),
  regUpdate: vi.fn(),
  shippedFindUnique: vi.fn(),
  sendSmsMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    warrantyRegistration: { count: regCount, findUnique: regFindUnique, create: regCreate, update: regUpdate },
    shippedDevice: { findUnique: shippedFindUnique },
  },
}));

vi.mock("@/lib/sms", () => ({ sendSms: sendSmsMock }));

const LINK = {
  orderNo: "20261015091460001001001",
  userPhone: "01055193568",
  shipDate: "2026-10-16",
  installerPhone: "01022452222",
  quantity: 1,
};

function input(overrides: Partial<Parameters<typeof registerByCjLink>[0]> = {}) {
  return {
    token: createCjRegLinkToken(LINK),
    sn: "AKS1234567",
    installDate: "2026-10-20",
    consentPrivacy: true,
    consentMarketing: false,
    ...overrides,
  };
}

describe("registerByCjLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T03:00:00Z"));
    process.env.MANAGEMENT_SESSION_SECRET = "test-secret";
    regCount.mockResolvedValue(0);
    regFindUnique.mockResolvedValue(null);
    shippedFindUnique.mockResolvedValue({ sn: "AKS1234567" });
  });

  it("기사 확인 없이 2년으로 확정하고 주문번호를 남긴다", async () => {
    const result = await registerByCjLink(input());

    expect(result).toMatchObject({ ok: true, freeAsEndDate: "2028-10-19", installerPhone: LINK.installerPhone });
    expect(regCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sn: "AKS1234567",
        installType: "installer",
        status: "confirmed",
        userPhone: LINK.userPhone,
        installerPhone: LINK.installerPhone,
        confirmedBy: `cj_dispatch:${LINK.orderNo}`,
        confirmToken: null,
        freeAsEndDate: "2028-10-19",
      }),
    });
    expect(sendSmsMock).toHaveBeenCalledWith(LINK.userPhone, expect.stringContaining("2028-10-19"), "[Aqara]", expect.anything());
  });

  it("설치일은 출고일과 오늘 사이만 받는다", async () => {
    expect(await registerByCjLink(input({ installDate: "2026-10-15" }))).toEqual({
      ok: false,
      error: "INSTALL_DATE_BEFORE_SHIP",
    });
    expect(await registerByCjLink(input({ installDate: "2026-10-30" }))).toEqual({
      ok: false,
      error: "INSTALL_DATE_IN_FUTURE",
    });
    expect((await registerByCjLink(input({ installDate: "2026-10-16" }))).ok).toBe(true);
  });

  it("주문 수량만큼 등록되면 더 받지 않는다", async () => {
    regCount.mockResolvedValue(1);
    expect(await registerByCjLink(input())).toEqual({ ok: false, error: "LINK_ALREADY_USED" });
    expect(regCreate).not.toHaveBeenCalled();
  });

  it("이미 확정된 SN 은 덮어쓰지 않는다", async () => {
    regFindUnique.mockResolvedValue({ id: "reg-1", status: "confirmed" });
    expect(await registerByCjLink(input())).toEqual({ ok: false, error: "ALREADY_CONFIRMED" });
    expect(regUpdate).not.toHaveBeenCalled();
  });

  it("기사 확인을 기다리던 SN 은 이 링크로 확정한다", async () => {
    regFindUnique.mockResolvedValue({ id: "reg-1", status: "submitted" });
    expect(await registerByCjLink(input())).toMatchObject({ ok: true, id: "reg-1" });
    expect(regUpdate).toHaveBeenCalledWith({
      where: { id: "reg-1" },
      data: expect.objectContaining({ status: "confirmed", confirmedBy: `cj_dispatch:${LINK.orderNo}` }),
    });
  });

  it("출고 명단에 없는 SN 은 받지 않는다", async () => {
    shippedFindUnique.mockResolvedValue(null);
    expect(await registerByCjLink(input())).toEqual({ ok: false, error: "SN_NOT_FOUND" });
  });
});
