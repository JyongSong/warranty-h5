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
  submitPartnerCompletion,
  switchOrderToInhouse,
  updatePartnerStatus,
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
      source: { memo: "용역 월패드 모듈 설치비 x1" },
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
    });

    await expect(
      updatePartnerStatus("order-1", { partnerId: "partner-pl", userId: "acc-1", status: "UNABLE", body: " " }),
    ).rejects.toThrow("REASON_REQUIRED");

    await updatePartnerStatus("order-1", {
      partnerId: "partner-pl",
      userId: "acc-1",
      status: "UNABLE",
      body: "천장 구조상 설치 불가",
    });
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
    });

    await expect(
      updatePartnerStatus("order-1", { partnerId: "partner-pl", userId: "acc-1", status: "SCHEDULED" }),
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

  it("moves a submitted completion to HQ review", async () => {
    db.installationOrder.findUnique.mockResolvedValue({
      id: "order-1",
      status: "INSTALLER_ASSIGNED",
      partnerId: "partner-pl",
      partnerStatus: "SCHEDULED",
    });

    await submitPartnerCompletion("order-1", {
      partnerId: "partner-pl",
      userId: "acc-1",
      photoPaths: ["partner/order-1/a.jpg"],
    });

    expect(transition).toHaveBeenCalledWith(
      "order-1",
      "WAITING_HQ_REVIEW",
      expect.objectContaining({ orderData: expect.objectContaining({ partnerStatus: "COMPLETION_SUBMITTED" }) }),
      db,
    );
  });

  it("returns a rejected completion to PL and requires a reason", async () => {
    db.installationOrder.findUnique.mockResolvedValue({ id: "order-1", status: "WAITING_HQ_REVIEW", partnerId: "partner-pl" });

    await expect(reviewPartnerCompletion("order-1", { adminId: "admin-1", approve: false })).rejects.toThrow(
      "REASON_REQUIRED",
    );

    await reviewPartnerCompletion("order-1", { adminId: "admin-1", approve: false, reason: "사진 부족" });
    expect(transition).toHaveBeenLastCalledWith(
      "order-1",
      "INSTALLER_ASSIGNED",
      expect.objectContaining({ orderData: expect.objectContaining({ partnerStatus: "SCHEDULED" }) }),
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
});
