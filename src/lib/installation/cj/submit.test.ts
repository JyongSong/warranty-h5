import { beforeEach, describe, expect, it, vi } from "vitest";

// submit.ts 는 prisma 를 모듈 최상단에서 끌어오므로 먼저 목을 세운다.
const manifestUpdateMany = vi.fn();
const manifestUpdate = vi.fn();
const sourceCreate = vi.fn();
const orderCreate = vi.fn();
const orderUpdate = vi.fn();
const requestCreate = vi.fn();
const statusEventCreate = vi.fn();

const tx = {
  cjOrderManifest: { updateMany: manifestUpdateMany, update: manifestUpdate },
  installationOrderSource: { create: sourceCreate },
  installationOrder: { create: orderCreate, update: orderUpdate },
  installationCustomerRequest: { create: requestCreate },
  installationOrderStatusEvent: { create: statusEventCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

vi.mock("@/lib/piiCrypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/piiCrypto")>();
  return {
    ...actual,
    // 테스트 환경에는 암호화 키가 없다. 값이 어느 칼럼에 들어가는지만 본다.
    encryptNullablePii: (value: string | null | undefined) => (value ? `enc:${value}` : null),
    hmacPii: (value: string) => `hash:${value}`,
  };
});

const lookupCjOrderNo = vi.fn();
vi.mock("@/lib/installation/cj/manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/installation/cj/manifest")>();
  return { ...actual, lookupCjOrderNo: (...args: unknown[]) => lookupCjOrderNo(...args) };
});

const consumeVerifiedCustomerPhone = vi.fn();
vi.mock("@/lib/installation/cj/otp", () => ({
  consumeVerifiedCustomerPhone: (...args: unknown[]) => consumeVerifiedCustomerPhone(...args),
  CustomerOtpError: class CustomerOtpError extends Error {},
}));

const dispatchReadyInstallationOrders = vi.fn();
vi.mock("@/lib/installation/installer/dispatch", () => ({
  dispatchReadyInstallationOrders: (...args: unknown[]) => dispatchReadyInstallationOrders(...args),
}));

const { submitCjCustomerRequest } = await import("@/lib/installation/cj/submit");
const { InstallationCustomerRequestError } = await import("@/lib/installation/customer/errors");

const VALID_INPUT = {
  orderNo: "20260620034905",
  ordererPhone: "01011112222",
  ordererVerifiedToken: "token-1",
  customerPhone: "01033334444",
  installAddress: "서울특별시 강남구 테헤란로 1",
  installAddressDetail: "101동 1002호",
  installDate: "2026-09-10",
  installTimeSlot: "오전 09:00 - 12:00",
  customerNote: null,
  now: new Date("2026-08-27T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  lookupCjOrderNo.mockResolvedValue({
    status: "OK",
    manifestId: "manifest-1",
    orderNo: "20260620034905",
    orderDate: "2026-06-20",
  });
  consumeVerifiedCustomerPhone.mockResolvedValue(undefined);
  manifestUpdateMany.mockResolvedValue({ count: 1 });
  sourceCreate.mockResolvedValue({ id: "source-1" });
  orderCreate.mockResolvedValue({ id: "order-1" });
  requestCreate.mockResolvedValue({ id: "request-1" });
  dispatchReadyInstallationOrders.mockResolvedValue(undefined);
});

describe("submitCjCustomerRequest", () => {
  it("소스·주문·고객요청을 한 번에 만들고 배정 대기 상태로 둔다", async () => {
    const result = await submitCjCustomerRequest(VALID_INPUT);

    expect(result).toEqual({ installationOrderId: "order-1", customerRequestId: "request-1" });

    expect(sourceCreate.mock.calls[0][0].data).toMatchObject({
      sourceKey: "CJ-20260620034905",
      channel: "CJ",
      externalOrderNo: "20260620034905",
      externalOrderDate: "2026-06-20",
      // 배정 정규식이 K100 을 읽어 DOORLOCK 능력을 뽑아낸다.
      memo: "스마트 도어락 K100 x1",
      // 백오피스의 "주문일" 자리 — 설치 희망일이 아니라 CJ 주문일이 들어간다.
      dueDate: "20260620",
    });

    expect(orderCreate.mock.calls[0][0].data).toMatchObject({
      sourceId: "source-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
    });
  });

  it("월패드·허브는 memo 에 적지 않는다(도어락 조건으로만 배정)", async () => {
    await submitCjCustomerRequest(VALID_INPUT);

    const memo = sourceCreate.mock.calls[0][0].data.memo as string;
    expect(memo).not.toMatch(/월패드|허브|앱 설치/);
  });

  it("두 번호를 각각 제자리에 저장한다", async () => {
    await submitCjCustomerRequest(VALID_INPUT);

    expect(requestCreate.mock.calls[0][0].data).toMatchObject({
      // 기사가 거는 번호
      customerPhoneEncrypted: "enc:01033334444",
      customerPhoneHash: "hash:01033334444",
      customerPhoneSource: "CUSTOMER",
      // 인증을 거친 주문자 번호
      ordererPhoneEncrypted: "enc:01011112222",
      ordererPhoneHash: "hash:01011112222",
      status: "SUBMITTED",
    });
  });

  it("명단에 없는 주문번호는 거절한다", async () => {
    lookupCjOrderNo.mockResolvedValue({ status: "NOT_FOUND" });

    await expect(submitCjCustomerRequest(VALID_INPUT)).rejects.toThrow(
      new InstallationCustomerRequestError("CJ_ORDER_NO_NOT_FOUND"),
    );
    expect(sourceCreate).not.toHaveBeenCalled();
  });

  it("이미 쓰인 주문번호는 거절한다", async () => {
    lookupCjOrderNo.mockResolvedValue({ status: "ALREADY_USED" });

    await expect(submitCjCustomerRequest(VALID_INPUT)).rejects.toThrow(
      new InstallationCustomerRequestError("CJ_ORDER_NO_ALREADY_USED"),
    );
  });

  it("같은 주문번호가 동시에 들어오면 뒤엣것을 막는다", async () => {
    // 조회는 통과했지만 그 사이 다른 요청이 명단을 가져간 상황.
    manifestUpdateMany.mockResolvedValue({ count: 0 });

    await expect(submitCjCustomerRequest(VALID_INPUT)).rejects.toThrow(
      new InstallationCustomerRequestError("CJ_ORDER_NO_ALREADY_USED"),
    );
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("인증 확인은 값 검증을 모두 통과한 뒤에 한다", async () => {
    // 주소가 비어 있으면 인증 토큰을 태우기 전에 멈춰야 한다. 그래야 고객이
    // 오타 하나 때문에 재인증하지 않는다.
    await expect(
      submitCjCustomerRequest({ ...VALID_INPUT, installAddress: "" }),
    ).rejects.toThrow(new InstallationCustomerRequestError("INSTALL_ADDRESS_REQUIRED"));

    expect(consumeVerifiedCustomerPhone).not.toHaveBeenCalled();
  });

  it("설치 받는 분 번호가 안심번호면 거절한다", async () => {
    await expect(
      submitCjCustomerRequest({ ...VALID_INPUT, customerPhone: "05012345678" }),
    ).rejects.toThrow(new InstallationCustomerRequestError("CUSTOMER_PHONE_IS_SAFE_NUMBER"));
  });

  it("주문자 번호가 휴대폰이 아니면 거절한다", async () => {
    await expect(
      submitCjCustomerRequest({ ...VALID_INPUT, ordererPhone: "0212345678" }),
    ).rejects.toThrow(new InstallationCustomerRequestError("ORDERER_PHONE_INVALID"));
  });

  it("설치일이 범위를 벗어나면 거절한다", async () => {
    await expect(
      // now 기준 다음 날 = D+1 (최소 D+2)
      submitCjCustomerRequest({ ...VALID_INPUT, installDate: "2026-08-28" }),
    ).rejects.toThrow(new InstallationCustomerRequestError("INSTALL_DATE_OUT_OF_RANGE"));
  });

  it("배정이 실패해도 제출은 확정으로 남긴다", async () => {
    dispatchReadyInstallationOrders.mockRejectedValue(new Error("dispatch boom"));

    await expect(submitCjCustomerRequest(VALID_INPUT)).resolves.toMatchObject({
      installationOrderId: "order-1",
    });
  });
});
