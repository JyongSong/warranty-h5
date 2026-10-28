import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, transition, createIssue, findMissingPhotos } = vi.hoisted(() => {
  const db = {
    installationPartner: { findUnique: vi.fn() },
    installationOrder: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    installationInstallerAssignmentAttempt: { updateMany: vi.fn() },
    installationPartnerNote: { create: vi.fn() },
    installationNotification: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return { db, transition: vi.fn(), createIssue: vi.fn(), findMissingPhotos: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/installation/orders/status", () => ({
  INSTALLATION_ORDER_STATUSES: {
    CUSTOMER_INPUT_SMS_REQUIRED: "CUSTOMER_INPUT_SMS_REQUIRED",
    WAITING_CUSTOMER_INPUT: "WAITING_CUSTOMER_INPUT",
    READY_FOR_CANDIDATE_SELECTION: "READY_FOR_CANDIDATE_SELECTION",
    WAITING_ADMIN_REVIEW: "WAITING_ADMIN_REVIEW",
    WAITING_INSTALLER_RESPONSE: "WAITING_INSTALLER_RESPONSE",
    INSTALLER_ASSIGNED: "INSTALLER_ASSIGNED",
    WAITING_HQ_REVIEW: "WAITING_HQ_REVIEW",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
  },
  transitionInstallationOrderStatus: transition,
}));
vi.mock("@/lib/installation/orders/issues/create", () => ({ createInstallationIssue: createIssue }));
vi.mock("@/lib/installer/storage", () => ({ findMissingPhotos }));

import {
  assignReadyOrdersToPartner,
  reviewPartnerCompletion,
  setPartnerClaimAmount,
  setPartnerInstaller,
  setPartnerInstallItems,
  submitPartnerCompletion,
  reportPartnerUnable,
  switchOrderToInhouse,
} from "@/lib/installation/partner/service";

const PARTNER = { id: "partner-pl", name: "PL", notifyPhone: "010-1111-2222", active: true };

describe("installation partner service", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    db.installationPartner.findUnique.mockResolvedValue(PARTNER);
    findMissingPhotos.mockResolvedValue([]);
  });

  it("assigns ready 조명/월패드 orders to PL and queues an SMS to the PL admin", async () => {
    db.installationOrder.findMany.mockResolvedValue([{ id: "order-1" }]);
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeAssignmentId: null,
      activeCustomerRequestId: "request-1",
      source: { memo: "용역 조명 스위치 설치비 x1" },
      activeCustomerRequest: { installDate: "2026-10-30", installAddress1Encrypted: null },
    });

    const result = await assignReadyOrdersToPartner({ now: new Date("2026-10-27T01:00:00Z"), baseUrl: "https://x.test" });

    expect(result).toEqual({ assignedCount: 1, failedCount: 0 });
    const where = db.installationOrder.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("READY_FOR_CANDIDATE_SELECTION");
    expect(where.partnerId).toBeNull();
    expect(transition).toHaveBeenCalledWith(
      "order-1",
      "INSTALLER_ASSIGNED",
      expect.objectContaining({
        orderData: expect.objectContaining({ partnerId: "partner-pl", partnerStatus: "RECEIVED", currentInstallerId: null }),
      }),
      db,
    );
    const notification = db.installationNotification.upsert.mock.calls[0][0].create;
    expect(notification.smsType).toBe("PARTNER_ASSIGNMENT_REQUEST");
    expect(notification.recipientType).toBe("PARTNER");
    expect(notification.smsBody).toContain("https://x.test/partner/orders/order-1");
  });

  it("skips assignment entirely when the PL partner is not configured", async () => {
    db.installationPartner.findUnique.mockResolvedValue(null);

    const result = await assignReadyOrdersToPartner();

    expect(result).toEqual({ assignedCount: 0, failedCount: 0, skippedNoPartner: true });
    expect(db.installationOrder.findMany).not.toHaveBeenCalled();
  });

  it("requires a reason for 설치 불가 and raises an HQ issue", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "RECEIVED",
      partnerClaimAmount: null,
    });

    await expect(
      reportPartnerUnable("order-1", { partnerId: "partner-pl", userId: "acc-1", reason: " " }),
    ).rejects.toThrow("REASON_REQUIRED");

    await reportPartnerUnable("order-1", { partnerId: "partner-pl", userId: "acc-1", reason: "천장 구조상 설치 불가" });
    expect(db.installationOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ partnerStatus: "UNABLE" }) }),
    );
    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ installationOrderId: "order-1", type: "INSTALLATION_NOT_COMPLETED" }),
      db,
    );
  });

  it("hides orders of another partner", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-other",
      partnerStatus: "RECEIVED",
      partnerClaimAmount: null,
    });

    await expect(
      setPartnerClaimAmount("order-1", { partnerId: "partner-pl", userId: "acc-1", amount: 100000 }),
    ).rejects.toThrow("ORDER_NOT_FOUND");
  });

  it("rejects completion photos outside the order's partner folder", async () => {
    await expect(
      submitPartnerCompletion("order-1", {
        partnerId: "partner-pl",
        userId: "acc-1",
        photoPaths: ["orders/order-1/a.jpg"],
      }),
    ).rejects.toThrow("PHOTO_PATH_INVALID");
  });

  it("moves a submitted completion to HQ review, with progress text and photos both optional", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "ACCEPTED",
      partnerClaimAmount: 150000,
    });

    await submitPartnerCompletion("order-1", { partnerId: "partner-pl", userId: "acc-1", photoPaths: [], now: new Date("2026-10-31T09:00:00Z") });

    expect(findMissingPhotos).toHaveBeenCalledWith([]);
    expect(db.installationPartnerNote.create.mock.calls[0][0].data).toMatchObject({
      kind: "COMPLETION",
      body: null,
      photoPaths: [],
    });
    expect(transition).toHaveBeenCalledWith(
      "order-1",
      "WAITING_HQ_REVIEW",
      expect.objectContaining({
        orderData: expect.objectContaining({
          partnerStatus: "COMPLETION_SUBMITTED",
          partnerCompletedAt: new Date("2026-10-31T09:00:00Z"),
        }),
      }),
      db,
    );
  });

  it("requires the claim amount before completion", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "ACCEPTED",
      partnerClaimAmount: null,
    });

    await expect(
      submitPartnerCompletion("order-1", { partnerId: "partner-pl", userId: "acc-1", photoPaths: [] }),
    ).rejects.toThrow("CLAIM_AMOUNT_REQUIRED");
    expect(transition).not.toHaveBeenCalled();
  });

  it("records the first claim amount and requires a reason to change it", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "RECEIVED",
      partnerClaimAmount: null,
    });
    await setPartnerClaimAmount("order-1", { partnerId: "partner-pl", userId: "acc-1", amount: 150000 });
    expect(db.installationOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({ partnerClaimAmount: 150000, partnerStatus: "ACCEPTED" }),
    });
    expect(db.installationPartnerNote.create.mock.calls[0][0].data).toMatchObject({
      kind: "AMOUNT",
      partnerStatus: "ACCEPTED",
      body: "접수 · 청구 금액 150,000원",
    });

    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "ACCEPTED",
      partnerClaimAmount: 150000,
    });
    await expect(
      setPartnerClaimAmount("order-1", { partnerId: "partner-pl", userId: "acc-1", amount: 180000 }),
    ).rejects.toThrow("CLAIM_CHANGE_REASON_REQUIRED");

    await setPartnerClaimAmount("order-1", {
      partnerId: "partner-pl",
      userId: "acc-1",
      amount: 180000,
      reason: "현장 배선 추가",
    });
    expect(db.installationPartnerNote.create.mock.calls[1][0].data.body).toBe(
      "청구 금액 150,000원 → 180,000원\n현장 배선 추가",
    );
  });

  it("records the 담당 기사 PL types in, logging each change", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "ACCEPTED",
      partnerClaimAmount: 150000,
      partnerInstaller: "홍길동",
    });

    await expect(
      setPartnerInstaller("order-1", { partnerId: "partner-pl", userId: "acc-1", installer: "  " }),
    ).rejects.toThrow("INSTALLER_REQUIRED");

    await setPartnerInstaller("order-1", { partnerId: "partner-pl", userId: "acc-1", installer: " 김철수  010-1111-2222 " });
    expect(db.installationOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { partnerInstaller: "김철수 010-1111-2222" },
    });
    expect(db.installationPartnerNote.create.mock.calls[0][0].data).toMatchObject({
      kind: "INSTALLER",
      body: "담당 기사 홍길동 → 김철수 010-1111-2222",
    });
  });

  it("does not let the amount change after completion was submitted", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "WAITING_HQ_REVIEW",
      partnerId: "partner-pl",
      partnerStatus: "COMPLETION_SUBMITTED",
      partnerClaimAmount: 150000,
    });

    await expect(
      setPartnerClaimAmount("order-1", { partnerId: "partner-pl", userId: "acc-1", amount: 200000, reason: "추가" }),
    ).rejects.toThrow("ORDER_NOT_WORKABLE");
    await expect(
      setPartnerClaimAmount("order-1", { partnerId: "partner-pl", userId: "acc-1", amount: -1 }),
    ).rejects.toThrow("CLAIM_AMOUNT_INVALID");
  });

  it("returns a rejected completion to PL as 접수 완료 and requires a reason", async () => {
    db.installationOrder.findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_HQ_REVIEW", partnerId: "partner-pl" });

    await expect(reviewPartnerCompletion("order-1", { adminId: "admin-1", approve: false })).rejects.toThrow(
      "REASON_REQUIRED",
    );

    await reviewPartnerCompletion("order-1", { adminId: "admin-1", approve: false, reason: "사진 부족" });
    expect(transition).toHaveBeenLastCalledWith(
      "order-1",
      "INSTALLER_ASSIGNED",
      expect.objectContaining({ orderData: expect.objectContaining({ partnerStatus: "ACCEPTED" }) }),
      db,
    );

    await reviewPartnerCompletion("order-1", { adminId: "admin-1", approve: true });
    expect(transition).toHaveBeenLastCalledWith("order-1", "COMPLETED", expect.anything(), db);
  });

  it("switches a PL order back to in-house dispatch and pins the routing", async () => {
    db.installationOrder.findUnique.mockResolvedValue({ id: "order-1", status: "INSTALLER_ASSIGNED", partnerId: "partner-pl" });

    await switchOrderToInhouse("order-1", { adminId: "admin-1", reason: "PL 일정 불가" });

    expect(transition).toHaveBeenCalledWith(
      "order-1",
      "READY_FOR_CANDIDATE_SELECTION",
      expect.objectContaining({ orderData: expect.objectContaining({ partnerId: null, partnerRouting: "INHOUSE" }) }),
      db,
    );
  });

  it("lets HQ edit 설치 품목, logging the new list, and revert to the memo", async () => {
    const memo = "용역 도어락 설치비(K100) x1 / 용역 도어벨 상시전원 설치비 (부자재 비용 현장 결제) x1 / 용역 출장비 x1";
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerInstallItems: null,
      source: { memo },
    });

    await setPartnerInstallItems("order-1", {
      adminId: "admin-1",
      items: [
        { code: "00050", quantity: 1 },
        { code: null, name: "중문 설치", quantity: 2, onsitePayment: true },
      ],
    });

    expect(db.installationOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        partnerInstallItems: [
          { code: "00050", name: "K100도어락설치", quantity: 1, onsitePayment: false },
          { code: null, name: "중문 설치", quantity: 2, onsitePayment: true },
        ],
      },
    });
    expect(db.installationPartnerNote.create.mock.calls[0][0].data).toMatchObject({
      authorType: "HQ",
      kind: "ITEMS",
      partnerId: "partner-pl",
      body: "설치 품목 수정\nK100도어락설치 ×1, 중문 설치 ×2 (현장결제)",
    });

    // 자동 판별과 같은 목록을 그대로 저장하려 하면 아무것도 바꾸지 않는다.
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerInstallItems: null,
      source: { memo },
    });
    await setPartnerInstallItems("order-1", { adminId: "admin-1", items: null });
    expect(db.installationOrder.update).not.toHaveBeenCalled();
  });

  it("rejects 설치 품목 edits on non-PL or cancelled orders and bad rows", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: null,
      partnerInstallItems: null,
      source: { memo: null },
    });
    await expect(setPartnerInstallItems("order-1", { adminId: "a", items: [] })).rejects.toThrow("ORDER_NOT_PARTNER");

    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "CANCELLED",
      partnerId: "partner-pl",
      partnerInstallItems: null,
      source: { memo: null },
    });
    await expect(setPartnerInstallItems("order-1", { adminId: "a", items: [] })).rejects.toThrow("ORDER_NOT_WORKABLE");

    await expect(
      setPartnerInstallItems("order-1", { adminId: "a", items: [{ code: "00054", quantity: 0 }] }),
    ).rejects.toThrow("INSTALL_ITEM_QUANTITY_INVALID");
  });
});
