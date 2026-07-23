import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssignmentSmsSecurityError,
  finishAssignmentSmsDispatch,
  getAssignmentSmsLimits,
  getKstUsageDate,
  reserveAssignmentSmsDispatch,
  validateAssignmentSmsUpload,
} from "./sms-dispatch-security";

const {
  settingCreateMock,
  settingFindManyMock,
  settingFindUniqueMock,
  settingUpdateMock,
  queryRawMock,
  transactionMock,
} = vi.hoisted(() => ({
  settingCreateMock: vi.fn(),
  settingFindManyMock: vi.fn(),
  settingFindUniqueMock: vi.fn(),
  settingUpdateMock: vi.fn(),
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    backofficeSetting: {
      findMany: settingFindManyMock,
      findUnique: settingFindUniqueMock,
      update: settingUpdateMock,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  settingFindManyMock.mockResolvedValue([]);
  transactionMock.mockImplementation(async (callback) =>
    callback({
      $queryRaw: queryRawMock,
      backofficeSetting: { create: settingCreateMock },
    }),
  );
});

describe("assignment SMS limits", () => {
  it("uses bounded defaults when settings are missing", async () => {
    await expect(getAssignmentSmsLimits()).resolves.toEqual({
      maxFileBytes: 2 * 1024 * 1024,
      maxRecipientsPerRequest: 500,
      maxRecipientsPerDay: 1000,
    });
  });

  it("loads valid limits from backoffice settings and falls back for invalid values", async () => {
    settingFindManyMock.mockResolvedValue([
      { key: "backoffice.sms.assignment.maxFileBytes", value: "4194304" },
      { key: "backoffice.sms.assignment.maxRecipientsPerRequest", value: "250" },
      { key: "backoffice.sms.assignment.maxRecipientsPerDay", value: "unlimited" },
    ]);

    await expect(getAssignmentSmsLimits()).resolves.toEqual({
      maxFileBytes: 4 * 1024 * 1024,
      maxRecipientsPerRequest: 250,
      maxRecipientsPerDay: 1000,
    });
  });

  it("rejects oversized files and recipient lists", () => {
    const limits = {
      maxFileBytes: 100,
      maxRecipientsPerRequest: 2,
      maxRecipientsPerDay: 10,
    };

    expect(() => validateAssignmentSmsUpload({ fileSize: 101, rowCount: 1 }, limits)).toThrowError(
      expect.objectContaining({ code: "SMS_FILE_TOO_LARGE", status: 413 }),
    );
    expect(() => validateAssignmentSmsUpload({ fileSize: 100, rowCount: 3 }, limits)).toThrowError(
      expect.objectContaining({ code: "SMS_RECIPIENT_LIMIT_EXCEEDED", status: 413 }),
    );
  });

  it("calculates the daily budget date in Korea time", () => {
    expect(getKstUsageDate(new Date("2026-07-22T15:30:00.000Z"))).toBe("2026-07-23");
  });

  it("exposes stable error metadata", () => {
    const error = new AssignmentSmsSecurityError("TEST_CODE", 429);
    expect(error.code).toBe("TEST_CODE");
    expect(error.status).toBe(429);
  });

  it("reserves the daily budget and creates a metadata-only audit setting", async () => {
    queryRawMock.mockResolvedValue([{ value: "12" }]);
    settingCreateMock.mockResolvedValue({ key: "audit-key" });

    const reservation = await reserveAssignmentSmsDispatch({
      adminId: "admin-1",
      fileName: "recipients.xlsx",
      recipientCount: 12,
      templateBody: "hello",
      templateKey: "assignment_completed",
      maxRecipientsPerDay: 1000,
      now: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(reservation?.key).toMatch(/^backoffice\.sms\.assignment\.audit\./);
    const createArgs = settingCreateMock.mock.calls[0]?.[0];
    expect(createArgs.data.key).toBe(reservation?.key);
    expect(createArgs.data.updatedBy).toBe("admin-1");
    expect(JSON.parse(createArgs.data.value)).toEqual({
      schemaVersion: 1,
      adminId: "admin-1",
      fileName: "recipients.xlsx",
      recipientCount: 12,
      templateKey: "assignment_completed",
      templateBodyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: "RESERVED",
      sentCount: 0,
      failedCount: 0,
      createdAt: "2026-07-23T00:00:00.000Z",
      completedAt: null,
    });
  });

  it("rejects a dispatch atomically when the daily budget is exhausted", async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(
      reserveAssignmentSmsDispatch({
        adminId: "admin-1",
        fileName: "recipients.xlsx",
        recipientCount: 1,
        templateBody: "hello",
        templateKey: "assignment_completed",
        maxRecipientsPerDay: 1000,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SMS_DAILY_LIMIT_EXCEEDED", status: 429 }),
    );
    expect(settingCreateMock).not.toHaveBeenCalled();
  });

  it("finishes the audit setting with aggregate results", async () => {
    settingFindUniqueMock.mockResolvedValue({
      value: JSON.stringify({
        schemaVersion: 1,
        adminId: "admin-1",
        fileName: "recipients.xlsx",
        recipientCount: 12,
        templateKey: "assignment_completed",
        templateBodyHash: "hash",
        status: "RESERVED",
        sentCount: 0,
        failedCount: 0,
        createdAt: "2026-07-23T00:00:00.000Z",
        completedAt: null,
      }),
    });
    settingUpdateMock.mockResolvedValue({ key: "audit-key" });

    await finishAssignmentSmsDispatch({
      auditKey: "audit-key",
      sentCount: 10,
      failedCount: 2,
    });

    const updateArgs = settingUpdateMock.mock.calls[0]?.[0];
    expect(updateArgs.where).toEqual({ key: "audit-key" });
    expect(JSON.parse(updateArgs.data.value)).toEqual(
      expect.objectContaining({
        sentCount: 10,
        failedCount: 2,
        status: "COMPLETED_WITH_ERRORS",
        completedAt: expect.any(String),
      }),
    );
  });
});
