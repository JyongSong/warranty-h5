import { beforeEach, describe, expect, it, vi } from "vitest";

const sourceFindMany = vi.fn();
const sourceFindFirst = vi.fn();
const sourceCreate = vi.fn();
const orderCreate = vi.fn();
const orderUpdate = vi.fn();
const requestCreate = vi.fn();
const statusEventCreate = vi.fn();

const tx = {
  installationOrderSource: { create: sourceCreate },
  installationOrder: { create: orderCreate, update: orderUpdate },
  installationCustomerRequest: { create: requestCreate },
  installationOrderStatusEvent: { create: statusEventCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrderSource: { findMany: sourceFindMany, findFirst: sourceFindFirst },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

vi.mock("@/lib/piiCrypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/piiCrypto")>();
  return {
    ...actual,
    encryptNullablePii: (value: string | null | undefined) => (value ? `enc:${value}` : null),
    hmacPii: (value: string) => `hash:${value}`,
  };
});

const dispatchReadyInstallationOrders = vi.fn();
vi.mock("@/lib/installation/installer/dispatch", () => ({
  dispatchReadyInstallationOrders: (...args: unknown[]) => dispatchReadyInstallationOrders(...args),
}));

const { createAdminManualOrder, getNextAdminManualOrderNumber, AdminManualOrderError } = await import(
  "@/lib/installation/orders/source/admin-create"
);

// 2026-11-18 13:00 KST
const NOW = new Date("2026-11-18T04:00:00Z");

const INPUT = {
  adminId: "admin-1",
  customerName: "홍길동",
  customerPhone: "010-1234-5678",
  installAddress: "서울 강남구 테헤란로 123",
  installAddressDetail: "101동 1001호",
  installDate: "2026-11-20",
  installTimeSlot: "오전 09:00 - 12:00",
  items: [{ option: "K100", quantity: 1 }],
  note: "주차 불가",
  now: NOW,
};

function uniqueViolation() {
  return Object.assign(new Error("unique"), { code: "P2002" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sourceFindMany.mockResolvedValue([]);
  sourceFindFirst.mockResolvedValue(null);
  sourceCreate.mockResolvedValue({ id: "src-1" });
  orderCreate.mockResolvedValue({ id: "order-1" });
  requestCreate.mockResolvedValue({ id: "req-1" });
});

describe("getNextAdminManualOrderNumber", () => {
  it("starts at 0001 for the KST day", async () => {
    await expect(getNextAdminManualOrderNumber(NOW)).resolves.toBe("MANUAL-20261118-0001");
  });

  it("continues after the highest numeric sequence and ignores old random suffixes", async () => {
    sourceFindMany.mockResolvedValue([
      { orderNumbers: "MANUAL-20261118-0002" },
      { orderNumbers: "MANUAL-20261118-a1b2c3d4" },
      { orderNumbers: "MANUAL-20261118-0007" },
    ]);
    await expect(getNextAdminManualOrderNumber(NOW)).resolves.toBe("MANUAL-20261118-0008");
  });
});

describe("createAdminManualOrder order number", () => {
  it("uses the auto sequence when no number is given", async () => {
    const result = await createAdminManualOrder(INPUT);
    expect(result.orderNumber).toBe("MANUAL-20261118-0001");
    expect(sourceCreate.mock.calls[0][0].data).toMatchObject({
      sourceKey: "MANUAL:MANUAL-20261118-0001",
      orderNumbers: "MANUAL-20261118-0001",
      channel: "MANUAL",
      memo: "용역 도어락 설치비(K100) x1",
    });
    expect(requestCreate.mock.calls[0][0].data).toMatchObject({ customerNote: "주차 불가", status: "SUBMITTED" });
  });

  it("keeps a number the admin typed", async () => {
    const result = await createAdminManualOrder({ ...INPUT, orderNumber: " ABC-777 " });
    expect(result.orderNumber).toBe("ABC-777");
    expect(sourceCreate.mock.calls[0][0].data.orderNumbers).toBe("ABC-777");
  });

  it("rejects a typed number that already exists", async () => {
    sourceFindFirst.mockResolvedValue({ id: "other" });
    await expect(createAdminManualOrder({ ...INPUT, orderNumber: "ABC-777" })).rejects.toThrow(
      "ORDER_NUMBER_DUPLICATE",
    );
    expect(sourceCreate).not.toHaveBeenCalled();
  });

  it("moves an untouched pre-filled number to the next sequence when someone took it first", async () => {
    sourceFindFirst.mockResolvedValueOnce({ id: "other" });
    sourceFindMany.mockResolvedValue([{ orderNumbers: "MANUAL-20261118-0003" }]);
    const result = await createAdminManualOrder({
      ...INPUT,
      orderNumber: "MANUAL-20261118-0003",
      orderNumberAuto: true,
    });
    expect(result.orderNumber).toBe("MANUAL-20261118-0004");
  });

  it("retries the next sequence when a concurrent insert hits the unique key", async () => {
    sourceCreate.mockRejectedValueOnce(uniqueViolation()).mockResolvedValue({ id: "src-2" });
    sourceFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orderNumbers: "MANUAL-20261118-0001" }]);
    const result = await createAdminManualOrder(INPUT);
    expect(result.orderNumber).toBe("MANUAL-20261118-0002");
  });

  it("rejects numbers with spaces or commas", async () => {
    await expect(createAdminManualOrder({ ...INPUT, orderNumber: "A, B" })).rejects.toBeInstanceOf(
      AdminManualOrderError,
    );
  });
});
