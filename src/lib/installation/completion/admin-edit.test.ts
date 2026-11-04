import { beforeEach, describe, expect, it, vi } from "vitest";
import { editApprovedCompletion, revertApprovedCompletion } from "@/lib/installation/completion/admin-edit";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findOrder: vi.fn(),
  updateOrder: vi.fn(),
  findCompletion: vi.fn(),
  updateCompletion: vi.fn(),
  findLine: vi.fn(),
  deleteLine: vi.fn(),
  updateLine: vi.fn(),
  createLine: vi.fn(),
  findFirstAttempt: vi.fn(),
  updateAttempt: vi.fn(),
  createStatusEvent: vi.fn(),
  findInstaller: vi.fn(),
  deleteWallpadCases: vi.fn(),
  upsertWallpadCase: vi.fn(),
  push: vi.fn(),
  sms: vi.fn(),
}));

function createTx() {
  return {
    installationOrder: { findUnique: mocks.findOrder, update: mocks.updateOrder },
    installationCompletion: { findUnique: mocks.findCompletion, update: mocks.updateCompletion },
    settlementLine: {
      findUnique: mocks.findLine,
      delete: mocks.deleteLine,
      update: mocks.updateLine,
      create: mocks.createLine,
    },
    installationInstallerAssignmentAttempt: { findFirst: mocks.findFirstAttempt, update: mocks.updateAttempt },
    installationOrderStatusEvent: { create: mocks.createStatusEvent },
    installationIssue: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    wallpadSiteCase: { deleteMany: mocks.deleteWallpadCases, upsert: mocks.upsertWallpadCase },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    installer: { findUnique: mocks.findInstaller },
  },
}));
vi.mock("@/lib/installer/devices", () => ({ sendAssignmentPushToInstaller: mocks.push }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sms }));
vi.mock("@/lib/installer/storage", () => ({ getCompletionPhotoSignedUrls: vi.fn() }));
vi.mock("@/lib/installation/settlement/rates", () => ({
  resolveInstallerRates: vi.fn().mockResolvedValue({ rates: {}, source: {} }),
}));
vi.mock("@/lib/installation/settlement/compute", () => ({
  computeInstallLineItems: vi.fn(() => ({
    items: {
      linkageFee: 30000,
      travelFee: 0,
      longDistanceFee: 0,
      nightWeekendFee: 0,
      serviceFee: 0,
      extraClaimFee: 0,
      wallpadAmount: 0,
      totalAmount: 30000,
    },
    breakdown: {},
  })),
  computeAsLineItems: vi.fn(),
}));

const approvedCompletion = {
  submittedInstallerId: "installer-1",
  reviewStatus: "APPROVED",
  achievedAqaraAppCapability: "DOORLOCK_AND_APP",
  wallpadLinked: false,
  wallpadAmount: null,
  longDistanceAmount: null,
  extraClaimAmount: null,
  extraClaimReason: null,
  installEndAt: new Date("2026-11-01T03:00:00Z"),
  createdAt: new Date("2026-11-01T03:00:00Z"),
};

describe("approved completion admin operations", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation(async (callback) => callback(createTx()));
    mocks.findOrder.mockResolvedValue({ id: "order-1", status: "COMPLETED", currentInstallerId: "installer-1" });
    mocks.findCompletion.mockResolvedValue(approvedCompletion);
    mocks.findInstaller.mockResolvedValue({ phone: "01011112222" });
  });

  describe("revertApprovedCompletion", () => {
    it("deletes the settlement line, revives the assignment and sends the order back to the installer", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "OPEN" } });
      mocks.findFirstAttempt.mockResolvedValue({ id: "attempt-1" });

      await revertApprovedCompletion({ adminId: "admin-1", orderId: "order-1", reason: "사진 오류" });

      expect(mocks.deleteLine).toHaveBeenCalledWith({ where: { id: "line-1" } });
      expect(mocks.updateAttempt).toHaveBeenCalledWith({
        where: { id: "attempt-1" },
        data: { status: "INSTALLER_ACCEPTED" },
      });
      expect(mocks.updateCompletion.mock.calls[0][0].data).toMatchObject({
        reviewStatus: "REJECTED",
        rejectionReason: "사진 오류",
      });
      expect(mocks.updateOrder.mock.calls[0][0].data).toMatchObject({
        status: "INSTALLER_ASSIGNED",
        activeAssignmentId: "attempt-1",
      });
      expect(mocks.createStatusEvent.mock.calls[0][0].data).toMatchObject({
        eventType: "ADMIN_REVERTED_COMPLETION",
        fromStatus: "COMPLETED",
        toStatus: "INSTALLER_ASSIGNED",
      });
      expect(mocks.push).toHaveBeenCalled();
      expect(mocks.sms).toHaveBeenCalledWith("01011112222", expect.stringContaining("승인이 취소"));
      // 월패드 호환 DB 에 남긴 이 주문의 사례도 지운다(다시 승인되면 새로 남는다).
      expect(mocks.deleteWallpadCases).toHaveBeenCalledWith({
        where: { installationOrderId: "order-1", source: "COMPLETION" },
      });
    });

    it("refuses when the line is already in a settled period", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "SETTLED" } });

      await expect(
        revertApprovedCompletion({ adminId: "admin-1", orderId: "order-1", reason: "사진 오류" }),
      ).rejects.toThrow("SETTLEMENT_PERIOD_NOT_OPEN");
      expect(mocks.deleteLine).not.toHaveBeenCalled();
      expect(mocks.updateOrder).not.toHaveBeenCalled();
    });

    it("only handles installer completions that were approved", async () => {
      mocks.findCompletion.mockResolvedValue(null);
      await expect(
        revertApprovedCompletion({ adminId: "admin-1", orderId: "order-1", reason: "x" }),
      ).rejects.toThrow("COMPLETION_NOT_APPROVED");

      mocks.findOrder.mockResolvedValue({ id: "order-1", status: "WAITING_HQ_REVIEW", currentInstallerId: "installer-1" });
      await expect(
        revertApprovedCompletion({ adminId: "admin-1", orderId: "order-1", reason: "x" }),
      ).rejects.toThrow("ORDER_NOT_COMPLETED");
    });
  });

  describe("editApprovedCompletion", () => {
    const editInput = {
      adminId: "admin-1",
      orderId: "order-1",
      reason: "허브 연동 확인",
      achievedAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
      wallpadLinked: false,
      wallpadAmount: null,
      longDistanceAmount: 20000,
      extraClaimAmount: null,
      extraClaimReason: null,
    };

    it("updates the completion, re-freezes the settlement line in place and logs the change", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "OPEN" } });

      await editApprovedCompletion(editInput);

      expect(mocks.updateCompletion.mock.calls[0][0].data).toMatchObject({
        achievedAqaraAppCapability: "DOORLOCK_AND_APP_AND_HUB",
        longDistanceAmount: 20000,
      });
      expect(mocks.updateLine.mock.calls[0][0]).toMatchObject({
        where: { id: "line-1" },
        data: { totalAmount: 30000, approvedByAdminId: "admin-1" },
      });
      // 열린 정산 기간에서 빠지지 않는다.
      expect(mocks.updateLine.mock.calls[0][0].data).not.toHaveProperty("periodId");
      const event = mocks.createStatusEvent.mock.calls[0][0].data;
      expect(event).toMatchObject({ eventType: "ADMIN_EDITED_COMPLETION", fromStatus: "COMPLETED", toStatus: "COMPLETED" });
      expect(event.metadata.changes.map((change: { field: string }) => change.field)).toEqual([
        "achievedAqaraAppCapability",
        "longDistanceAmount",
      ]);
      expect(mocks.updateOrder).not.toHaveBeenCalled();
    });

    it("leaves the wallpad case alone when the wallpad value did not change", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "OPEN" } });

      await editApprovedCompletion(editInput);

      expect(mocks.updateCompletion.mock.calls[0][0].data).not.toHaveProperty("wallpadResult");
      expect(mocks.deleteWallpadCases).not.toHaveBeenCalled();
      expect(mocks.upsertWallpadCase).not.toHaveBeenCalled();
    });

    it("turns a wallpad success into 'not attempted' but keeps a recorded failure", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "OPEN" } });
      mocks.findCompletion.mockResolvedValue({ ...approvedCompletion, wallpadLinked: true, wallpadResult: "SUCCESS" });

      await editApprovedCompletion({ ...editInput, achievedAqaraAppCapability: "DOORLOCK_AND_APP" });

      expect(mocks.updateCompletion.mock.calls[0][0].data).toMatchObject({
        wallpadLinked: false,
        wallpadResult: "NOT_ATTEMPTED",
        wallpadPhotoPaths: [],
      });
      expect(mocks.deleteWallpadCases).toHaveBeenCalled();

      mocks.updateCompletion.mockReset();
      mocks.findCompletion.mockResolvedValue({ ...approvedCompletion, wallpadLinked: false, wallpadResult: "FAIL" });
      await editApprovedCompletion({ ...editInput, wallpadLinked: true, achievedAqaraAppCapability: "DOORLOCK_AND_APP" });
      expect(mocks.updateCompletion.mock.calls[0][0].data).toMatchObject({ wallpadLinked: true, wallpadResult: "SUCCESS" });
    });

    it("requires a reason for a non-zero extra claim", async () => {
      await expect(editApprovedCompletion({ ...editInput, extraClaimAmount: 5000 })).rejects.toThrow(
        "EXTRA_CLAIM_REASON_REQUIRED",
      );
    });

    it("refuses to change a settled line", async () => {
      mocks.findLine.mockResolvedValue({ id: "line-1", periodId: "period-1", period: { status: "SETTLED" } });
      await expect(editApprovedCompletion(editInput)).rejects.toThrow("SETTLEMENT_PERIOD_NOT_OPEN");
    });

    it("reports when nothing changed", async () => {
      await expect(
        editApprovedCompletion({
          ...editInput,
          achievedAqaraAppCapability: "DOORLOCK_AND_APP",
          longDistanceAmount: null,
        }),
      ).rejects.toThrow("NOTHING_CHANGED");
    });
  });
});
