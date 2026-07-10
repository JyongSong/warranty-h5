import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  retrySmsNotification,
  sendPendingInstallationNotifications,
  syncInstallationSmsDeliveryReports,
} from "@/lib/installation/notifications/outbox";
import { encryptPii } from "@/lib/piiCrypto";

const {
  findMany,
  findUnique,
  findFirst,
  create,
  update,
  updateManyIssues,
  countIssues,
  findUniqueCustomerRequest,
  findUniqueAssignment,
  updateAssignment,
  updateOrder,
  createStatusEvent,
  createInstallationIssue,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateManyIssues: vi.fn(),
  countIssues: vi.fn(),
  findUniqueCustomerRequest: vi.fn(),
  findUniqueAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  updateOrder: vi.fn(),
  createStatusEvent: vi.fn(),
  createInstallationIssue: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationNotification: {
      findMany,
      findUnique,
      findFirst,
      create,
      update,
    },
    installationIssue: {
      findFirst,
      updateMany: updateManyIssues,
      count: countIssues,
    },
    installationCustomerRequest: {
      findUnique: findUniqueCustomerRequest,
    },
    installationInstallerAssignmentAttempt: {
      findUnique: findUniqueAssignment,
      update: updateAssignment,
    },
    installationOrder: {
      update: updateOrder,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  },
}));

vi.mock("@/lib/installation/orders/issues/create", () => ({
  createInstallationIssue,
}));

describe("sendPendingInstallationNotifications", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    findMany.mockReset();
    findUnique.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    updateManyIssues.mockReset();
    updateManyIssues.mockResolvedValue({ count: 0 });
    countIssues.mockReset();
    findUniqueCustomerRequest.mockReset();
    findUniqueAssignment.mockReset();
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      installationOrder: {
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
      },
    });
    updateAssignment.mockReset();
    updateOrder.mockReset();
    createStatusEvent.mockReset();
    createInstallationIssue.mockReset();
  });

  it("sends pending notifications and marks them sent", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    updateManyIssues.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        recipientPhoneEncrypted: encryptPii("010-1234-5678"),
        smsBody: "hello",
        retryCount: 0,
      },
    ]);

    const result = await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(result).toEqual({ sentCount: 1, failedCount: 0 });
    expect(sendSms).toHaveBeenCalledWith("010-1234-5678", "hello");
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "SENT",
        provider: "solapi",
        providerMessageId: "message-1",
        sentAt: now,
        errorCode: null,
        errorMessage: null,
      },
    });
  });

  it("resolves the matching SMS failed issue when a retried notification is sent", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_REMINDER",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 1,
      },
    ]);
    updateManyIssues.mockResolvedValue({ count: 1 });
    countIssues.mockResolvedValue(0);

    await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(updateManyIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        type: "CUSTOMER_INPUT_LINK_SMS_SEND_FAILED",
        status: "OPEN",
        metadata: {
          path: ["notificationId"],
          equals: "notification-1",
        },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNote: "SMS 재전송 성공으로 자동 해결했습니다.",
        updatedAt: now,
      },
    });
    expect(countIssues).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        status: "OPEN",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { hasOpenIssue: false },
    });
  });

  it("does not mark a provider-sent notification failed when post-send cleanup fails", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    updateManyIssues.mockRejectedValue(new Error("cleanup failed"));

    const result = await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(result).toEqual({ sentCount: 1, failedCount: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "SENT",
        provider: "solapi",
        providerMessageId: "message-1",
        sentAt: now,
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(update).not.toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "FAILED",
      }),
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[installation/notification/post-send]",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("marks installer assignment request notified when the SMS is sent", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);

    await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        installerNotifiedAt: now,
        installerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
        status: "WAITING_INSTALLER_RESPONSE",
      },
    });
  });

  it("skips a stale customer input link notification after the request is submitted", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    findUniqueCustomerRequest.mockResolvedValue({
      status: "SUBMITTED",
      installationOrder: {
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeCustomerRequestId: "request-1",
      },
    });

    const result = await sendPendingInstallationNotifications({ sendSms });

    expect(result).toEqual({ sentCount: 0, failedCount: 1 });
    expect(sendSms).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "FAILED",
        errorCode: "STALE_NOTIFICATION_SKIPPED",
        errorMessage: "CUSTOMER_INPUT_REQUEST_NOT_PENDING",
      },
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("skips a stale installer assignment notification after the installer already rejected", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "INSTALLER_REJECTED",
      installationOrder: {
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeAssignmentId: null,
      },
    });

    const result = await sendPendingInstallationNotifications({ sendSms });

    expect(result).toEqual({ sentCount: 0, failedCount: 1 });
    expect(sendSms).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "FAILED",
        errorCode: "STALE_NOTIFICATION_SKIPPED",
        errorMessage: "INSTALLER_ASSIGNMENT_NOT_WAITING_RESPONSE",
      },
    });
    expect(updateAssignment).not.toHaveBeenCalled();
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("keeps failed sends pending until the final retry", async () => {
    const sendSms = vi.fn().mockRejectedValue(new Error("provider down"));
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    const result = await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(result).toEqual({ sentCount: 0, failedCount: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "PENDING",
        retryCount: 1,
        errorCode: "SMS_FAILED",
        errorMessage: "provider down",
      }),
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("opens an issue when a send fails after the final retry", async () => {
    const sendSms = vi.fn().mockRejectedValue(new Error("provider down"));
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 2,
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    const result = await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(result).toEqual({ sentCount: 0, failedCount: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "FAILED",
        retryCount: 3,
        errorCode: "SMS_FAILED",
        errorMessage: "provider down",
      }),
    });
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED",
      title: "SMS 발송 실패",
      description: "provider down",
      metadata: {
        notificationId: "notification-1",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 3,
        failureStage: "SEND",
      },
      now,
    });
  });

  it("records provider delivery success reports without opening an issue", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    const reportedAt = "2026-06-11T00:09:00.000Z";
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 0,
        providerMessageId: "message-1",
      },
    ]);

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "COMPLETE",
        statusCode: "2000",
        reason: null,
        dateReported: reportedAt,
      }),
    });

    expect(result).toEqual({
      checkedCount: 1,
      updatedCount: 1,
      deliveryFailedCount: 0,
      failedCount: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        providerStatus: "COMPLETE",
        providerStatusCode: "2000",
        providerReason: null,
        providerReportedAt: new Date(reportedAt),
        providerCheckedAt: now,
      },
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("keeps provider delivery failures pending until the final retry", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 0,
        providerMessageId: "message-1",
      },
    ]);
    findFirst.mockResolvedValue(null);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(result).toEqual({
      checkedCount: 1,
      updatedCount: 1,
      deliveryFailedCount: 1,
      failedCount: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "PENDING",
        retryCount: 1,
        errorCode: "SMS_DELIVERY_FAILED",
        errorMessage: "SMS_DELIVERY_FAILED: 4000 수신 불가",
        providerStatus: "FAILED",
        providerStatusCode: "4000",
        providerReason: "수신 불가",
        providerCheckedAt: now,
      }),
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("opens an admin issue when provider delivery fails after the final retry", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 1,
        providerMessageId: "message-1",
      },
    ]);
    findFirst.mockResolvedValue(null);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(result).toEqual({
      checkedCount: 1,
      updatedCount: 1,
      deliveryFailedCount: 1,
      failedCount: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "FAILED",
        retryCount: 2,
        errorCode: "SMS_DELIVERY_FAILED",
        errorMessage: "SMS_DELIVERY_FAILED: 4000 수신 불가",
        providerStatus: "FAILED",
        providerStatusCode: "4000",
        providerReason: "수신 불가",
        providerCheckedAt: now,
      }),
    });
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED",
      title: "SMS 도달 실패",
      description: "SMS_DELIVERY_FAILED: 4000 수신 불가",
      metadata: {
        notificationId: "notification-1",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 2,
        failureStage: "DELIVERY",
        providerMessageId: "message-1",
        providerStatus: "FAILED",
        providerStatusCode: "4000",
        providerReason: "수신 불가",
        providerReportedAt: "2026-06-11T00:09:00.000Z",
      },
      now,
    });
  });

  it("marks customer input delivery failures pending for automatic retry", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 0,
        providerMessageId: "message-1",
      },
    ]);

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(result).toEqual({
      checkedCount: 1,
      updatedCount: 1,
      deliveryFailedCount: 1,
      failedCount: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "PENDING",
        retryCount: 1,
        errorCode: "SMS_DELIVERY_FAILED",
        errorMessage: "SMS_DELIVERY_FAILED: 4000 수신 불가",
        providerStatus: "FAILED",
        providerStatusCode: "4000",
        providerReason: "수신 불가",
        providerCheckedAt: now,
      }),
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("opens an issue when customer input delivery fails after the final retry", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 1,
        providerMessageId: "message-1",
      },
    ]);
    findFirst.mockResolvedValue(null);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        status: "FAILED",
        retryCount: 2,
        errorCode: "SMS_DELIVERY_FAILED",
        errorMessage: "SMS_DELIVERY_FAILED: 4000 수신 불가",
      }),
    });
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "CUSTOMER_INPUT_LINK_SMS_SEND_FAILED",
      title: "SMS 도달 실패",
      description: "SMS_DELIVERY_FAILED: 4000 수신 불가",
      metadata: {
        notificationId: "notification-1",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 2,
        failureStage: "DELIVERY",
        providerMessageId: "message-1",
        providerStatus: "FAILED",
        providerStatusCode: "4000",
        providerReason: "수신 불가",
        providerReportedAt: "2026-06-11T00:09:00.000Z",
      },
      now,
    });
  });

  it("marks installer assignment delivery failures as retry pending", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 0,
        providerMessageId: "message-1",
      },
    ]);

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(result).toEqual({
      checkedCount: 1,
      updatedCount: 1,
      deliveryFailedCount: 1,
      failedCount: 0,
    });
    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "SYSTEM_SMS_RETRY_PENDING",
      },
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("closes installer assignment delivery failures after the final retry", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 1,
        providerMessageId: "message-1",
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "FAILED",
        statusCode: "4000",
        reason: "수신 불가",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "SYSTEM_SMS_FAILED",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: null,
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED",
        actorType: "SYSTEM",
        actorId: null,
        reason: "SMS_DELIVERY_FAILED: 4000 수신 불가",
        metadata: {
          assignmentAttemptId: "assignment-1",
          notificationId: "notification-1",
          issueId: "issue-1",
        },
        createdAt: now,
      },
    });
  });

  it("marks failed installer assignment request SMS as retry pending", async () => {
    const sendSms = vi.fn().mockRejectedValue(new Error("provider down"));
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "SYSTEM_SMS_RETRY_PENDING",
      },
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("closes installer assignment request SMS as failed after the final retry", async () => {
    const sendSms = vi.fn().mockRejectedValue(new Error("provider down"));
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        recipientPhoneEncrypted: "010-1234-5678",
        smsBody: "hello",
        retryCount: 2,
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    await sendPendingInstallationNotifications({
      limit: 10,
      now,
      sendSms,
    });

    expect(updateAssignment).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: {
        status: "SYSTEM_SMS_FAILED",
      },
    });
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeAssignmentId: null,
        currentInstallerId: null,
        hasOpenIssue: true,
        lastIssueId: "issue-1",
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: null,
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "INSTALLER_ASSIGNMENT_SMS_SEND_FAILED",
        actorType: "SYSTEM",
        actorId: null,
        reason: "provider down",
        metadata: {
          assignmentAttemptId: "assignment-1",
          notificationId: "notification-1",
          issueId: "issue-1",
        },
        createdAt: now,
      },
    });
  });

  it("marks a failed notification pending for retry", async () => {
    findUnique.mockResolvedValue({
      id: "notification-1",
      installationOrderId: "order-1",
      assignmentAttemptId: null,
      smsType: "CUSTOMER_INPUT_REMINDER",
      recipientType: "CUSTOMER",
      recipientPhoneEncrypted: "010-1234-5678",
      status: "FAILED",
      sentAt: null,
    });
    findFirst.mockResolvedValue(null);
    update.mockResolvedValue({ id: "notification-1", status: "PENDING" });

    const result = await retrySmsNotification("notification-1");

    expect(result).toEqual({ id: "notification-1", status: "PENDING" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "PENDING",
        errorCode: null,
        errorMessage: null,
      },
      select: {
        id: true,
        status: true,
      },
    });
  });

  it("retries the latest failed assignment SMS by assignment attempt id", async () => {
    findUnique.mockResolvedValue({
      id: "notification-old",
      installationOrderId: "order-1",
      assignmentAttemptId: "assignment-1",
      smsType: "INSTALLER_ASSIGNMENT_REQUEST",
      recipientType: "INSTALLER",
      recipientPhoneEncrypted: "010-1234-5678",
      status: "FAILED",
      sentAt: null,
    });
    findFirst.mockResolvedValue({
      id: "notification-latest",
      status: "FAILED",
      sentAt: null,
    });
    update.mockResolvedValue({ id: "notification-latest", status: "PENDING" });

    const result = await retrySmsNotification("notification-old");

    expect(result).toEqual({ id: "notification-latest", status: "PENDING" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        assignmentAttemptId: "assignment-1",
        smsType: "INSTALLER_ASSIGNMENT_REQUEST",
        status: "FAILED",
        sentAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sentAt: true },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notification-latest" },
    }));
  });

  it("retries the latest failed non-assignment SMS by recipient and business event", async () => {
    findUnique.mockResolvedValue({
      id: "notification-old",
      installationOrderId: "order-1",
      assignmentAttemptId: null,
      smsType: "CUSTOMER_INPUT_REMINDER",
      recipientType: "CUSTOMER",
      recipientPhoneEncrypted: "010-1234-5678",
      status: "FAILED",
      sentAt: null,
    });
    findFirst.mockResolvedValue({
      id: "notification-latest",
      status: "FAILED",
      sentAt: null,
    });
    update.mockResolvedValue({ id: "notification-latest", status: "PENDING" });

    const result = await retrySmsNotification("notification-old");

    expect(result).toEqual({ id: "notification-latest", status: "PENDING" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_REMINDER",
        recipientType: "CUSTOMER",
        recipientPhoneEncrypted: "010-1234-5678",
        status: "FAILED",
        sentAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sentAt: true },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notification-latest" },
    }));
  });

  it("copies an already sent notification into a new pending notification for manual resend", async () => {
    findUnique.mockResolvedValue({
      id: "notification-1",
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      assignmentAttemptId: null,
      smsType: "CUSTOMER_INPUT_LINK",
      recipientType: "CUSTOMER",
      recipientPhoneEncrypted: "encrypted-phone",
      recipientPhoneHash: "phone-hash",
      smsTemplateKey: "customer-reservation-link",
      smsBody: "reuse existing link https://example.com/i/c/token",
      provider: "solapi",
      status: "SENT",
      sentAt: new Date("2026-06-11T00:00:00.000Z"),
    });
    create.mockResolvedValue({ id: "notification-resend-1", status: "PENDING" });

    const result = await retrySmsNotification("notification-1", {
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(result).toEqual({ id: "notification-resend-1", status: "PENDING" });
    expect(create).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientType: "CUSTOMER",
        recipientPhoneEncrypted: "encrypted-phone",
        recipientPhoneHash: "phone-hash",
        smsTemplateKey: "customer-reservation-link",
        smsBody: "reuse existing link https://example.com/i/c/token",
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: "manual-resend:notification-1:2026-06-12T00:00:00.000Z",
      },
      select: {
        id: true,
        status: true,
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not resend a sent notification without an installation order", async () => {
    findUnique.mockResolvedValue({
      id: "notification-1",
      status: "SENT",
      sentAt: new Date("2026-06-11T00:00:00.000Z"),
      installationOrderId: null,
    });

    await expect(retrySmsNotification("notification-1")).rejects.toThrow("NOTIFICATION_RESEND_NOT_SUPPORTED");

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
