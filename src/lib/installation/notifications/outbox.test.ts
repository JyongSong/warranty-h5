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
  listInstallerDeviceTokens,
  sendAssignmentPushToInstaller,
  isFcmConfiguredValue,
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
  listInstallerDeviceTokens: vi.fn(),
  sendAssignmentPushToInstaller: vi.fn(),
  isFcmConfiguredValue: { current: true },
}));

vi.mock("@/lib/installer/devices", () => ({
  listInstallerDeviceTokens,
  sendAssignmentPushToInstaller,
}));

vi.mock("@/lib/installer/firebase", () => ({
  isFcmConfigured: () => isFcmConfiguredValue.current,
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
    isFcmConfiguredValue.current = true;
    listInstallerDeviceTokens.mockReset();
    // 대부분의 기사는 아직 앱 미설치 상태라 기본은 문자 즉시 발송이다.
    listInstallerDeviceTokens.mockResolvedValue([]);
    sendAssignmentPushToInstaller.mockReset();
    findUniqueAssignment.mockReset();
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      installerId: "installer-1",
      installerTokenExpiresAt: null,
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

    expect(result).toEqual({ sentCount: 1, failedCount: 0, pushedCount: 0 });
    expect(sendSms).toHaveBeenCalledWith("010-1234-5678", "hello", {
      subject: null,
      alimtalk: undefined,
    });
  });

  it("pushes instead of texting when the installer has a registered device", async () => {
    const sendSms = vi.fn();
    const now = new Date("2026-06-11T00:00:00.000Z");
    listInstallerDeviceTokens.mockResolvedValue(["fcm-token-1"]);
    findMany.mockResolvedValue([assignmentRequestNotification()]);

    const result = await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(result).toEqual({ sentCount: 0, failedCount: 0, pushedCount: 1 });
    expect(sendAssignmentPushToInstaller).toHaveBeenCalledWith("installer-1", {
      title: "새 작업이 배정되었습니다",
      body: "앱에서 확인하고 수락/거절해 주세요.",
    });
    // 문자는 아직 나가지 않고, 행은 폴백을 기다리며 PENDING 으로 남는다.
    expect(sendSms).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: { pushSentAt: now },
    });
    // 마감 시각은 첫 알림인 푸시 시점부터 24시간.
    expect(updateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          installerNotifiedAt: now,
          installerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("texts immediately when FCM is not configured, even with a registered device", async () => {
    // 자격증명이 없으면 푸시는 조용히 no-op 한다. 보낸 것으로 치면 기사는
    // 폴백 시간 내내 아무 알림도 못 받는다.
    isFcmConfiguredValue.current = false;
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    listInstallerDeviceTokens.mockResolvedValue(["fcm-token-1"]);
    findMany.mockResolvedValue([assignmentRequestNotification()]);

    const result = await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(result).toEqual({ sentCount: 1, failedCount: 0, pushedCount: 0 });
    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendAssignmentPushToInstaller).not.toHaveBeenCalledWith(
      "installer-1",
      expect.anything(),
    );
  });

  it("texts immediately when the installer has no registered device", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    listInstallerDeviceTokens.mockResolvedValue([]);
    findMany.mockResolvedValue([assignmentRequestNotification()]);

    const result = await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(result).toEqual({ sentCount: 1, failedCount: 0, pushedCount: 0 });
    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendAssignmentPushToInstaller).not.toHaveBeenCalledWith(
      "installer-1",
      expect.anything(),
    );
  });

  it("does not extend the deadline when the fallback text follows a push", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T05:00:00.000Z");
    const deadline = new Date("2026-06-12T00:00:00.000Z");
    listInstallerDeviceTokens.mockResolvedValue(["fcm-token-1"]);
    findUniqueAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "WAITING_INSTALLER_RESPONSE",
      installerId: "installer-1",
      installerTokenExpiresAt: deadline,
      installationOrder: {
        status: "WAITING_INSTALLER_RESPONSE",
        activeAssignmentId: "assignment-1",
      },
    });
    findMany.mockResolvedValue([
      assignmentRequestNotification({ pushSentAt: new Date("2026-06-11T00:00:00.000Z") }),
    ]);

    const result = await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(result).toEqual({ sentCount: 1, failedCount: 0, pushedCount: 0 });
    // 푸시 시점에 정해진 마감을 그대로 두어야 총 24시간이 유지된다.
    const assignmentData = updateAssignment.mock.calls[0]?.[0].data;
    expect(assignmentData).not.toHaveProperty("installerTokenExpiresAt");
    expect(assignmentData).not.toHaveProperty("installerNotifiedAt");
    // 본문의 자리표시자가 실제 마감 시각으로 채워진다.
    expect(sendSms.mock.calls[0][1]).toContain("6월 12일(금) 9시까지");
    expect(sendSms.mock.calls[0][1]).not.toContain("{responseDeadline}");
  });

  it("restores the stored alimtalk template and the LMS subject at send time", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    updateManyIssues.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        recipientPhoneEncrypted: encryptPii("010-1234-5678"),
        smsTemplateKey: "customer_assignment_confirmed",
        smsBody: "hello",
        alimtalkTemplateKey: "assignment_completed",
        alimtalkVariables: { branchName: "강남점", installerPhone: "01011112222" },
        retryCount: 0,
      },
    ]);

    await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(sendSms).toHaveBeenCalledWith("010-1234-5678", "hello", {
      subject: "[아카라라이프] 설치 배정 완료",
      alimtalk: {
        templateKey: "assignment_completed",
        variables: { branchName: "강남점", installerPhone: "01011112222" },
      },
    });
  });

  it("falls back to SMS when the stored alimtalk template is not in the registry", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    updateManyIssues.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        recipientPhoneEncrypted: encryptPii("010-1234-5678"),
        smsTemplateKey: "customer_reservation_link",
        smsBody: "hello",
        // 아직 승인되지 않았거나 레지스트리에서 제거된 템플릿
        alimtalkTemplateKey: "not_registered_yet",
        alimtalkVariables: { productSummary: "K100" },
        retryCount: 0,
      },
    ]);

    await sendPendingInstallationNotifications({ limit: 10, now, sendSms });

    expect(sendSms).toHaveBeenCalledWith("010-1234-5678", "hello", {
      subject: "[아카라라이프] 설치 예약 안내",
      alimtalk: undefined,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "SENT",
        provider: "solapi",
        providerMessageId: "message-1",
        providerStatus: null,
        providerStatusCode: null,
        providerReason: null,
        providerReportedAt: null,
        providerCheckedAt: null,
        deliveryCheckCount: 0,
        sentAt: now,
        errorCode: null,
        errorMessage: null,
      },
    });
  });

  it("does not blindly resend when the provider accepted SMS but the sent-state update failed", async () => {
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "message-1" });
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_INPUT_LINK",
        recipientPhoneEncrypted: encryptPii("010-1234-5678"),
        smsBody: "hello",
        retryCount: 0,
      },
    ]);
    update
      .mockRejectedValueOnce(new Error("sent state update failed"))
      .mockResolvedValueOnce({ id: "notification-1", status: "UNKNOWN" });
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    await expect(
      sendPendingInstallationNotifications({ now, sendSms }),
    ).resolves.toEqual({ sentCount: 0, failedCount: 1, pushedCount: 0 });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "UNKNOWN",
        retryCount: 1,
        errorCode: "SMS_SEND_OUTCOME_UNKNOWN",
        errorMessage: "sent state update failed",
      },
    });
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "CUSTOMER_INPUT_LINK_SMS_SEND_FAILED",
      title: "SMS 발송 실패",
      description: "SMS_SEND_OUTCOME_UNKNOWN: sent state update failed",
      metadata: {
        notificationId: "notification-1",
        recipientPhoneEncrypted: expect.any(String),
        retryCount: 1,
        failureStage: "SEND",
      },
      now,
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

    expect(result).toEqual({ sentCount: 1, failedCount: 0, pushedCount: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "SENT",
        provider: "solapi",
        providerMessageId: "message-1",
        providerStatus: null,
        providerStatusCode: null,
        providerReason: null,
        providerReportedAt: null,
        providerCheckedAt: null,
        deliveryCheckCount: 0,
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
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "INSTALLATION_AUTOMATION_FAILED",
      title: "SMS 발송 후 상태 반영 실패",
      description: "cleanup failed",
      metadata: {
        stage: "POST_SEND_NOTIFICATION_EFFECTS",
        notificationId: "notification-1",
        assignmentAttemptId: null,
      },
      now,
    });
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

    expect(result).toEqual({ sentCount: 0, failedCount: 1, pushedCount: 0 });
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

    expect(result).toEqual({ sentCount: 0, failedCount: 1, pushedCount: 0 });
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

    expect(result).toEqual({ sentCount: 0, failedCount: 1, pushedCount: 0 });
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

    expect(result).toEqual({ sentCount: 0, failedCount: 1, pushedCount: 0 });
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

  it("marks a recovered provider delivery report delivered and clears confirmation failures", async () => {
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
        deliveryCheckCount: 1,
        providerMessageId: "message-1",
      },
    ]);

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "COMPLETE",
        statusCode: "4000",
        reason: "수신 완료",
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
        providerStatusCode: "4000",
        providerReason: "수신 완료",
        providerReportedAt: new Date(reportedAt),
        providerCheckedAt: now,
        deliveryCheckCount: 0,
        status: "DELIVERED",
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("keeps SOLAPI queued and sending status codes unconfirmed", async () => {
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

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => ({
        messageId: "message-1",
        status: "PENDING",
        statusCode: "2000",
        reason: "발송 대기",
        dateReported: "2026-06-11T00:09:00.000Z",
      }),
    });

    expect(result.deliveryFailedCount).toBe(0);
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: expect.objectContaining({
        providerStatusCode: "2000",
        providerCheckedAt: now,
      }),
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
        deliveryCheckCount: 1,
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

  it("opens an admin issue after the delivery report API retry also fails", async () => {
    const now = new Date("2026-06-11T00:10:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "notification-1",
        installationOrderId: "order-1",
        assignmentAttemptId: null,
        smsType: "CUSTOMER_ASSIGNMENT_CONFIRMED",
        recipientPhoneEncrypted: "010-1234-5678",
        retryCount: 1,
        deliveryCheckCount: 1,
        providerMessageId: "message-1",
      },
    ]);
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    const result = await syncInstallationSmsDeliveryReports({
      now,
      getDeliveryReport: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result).toEqual({
      checkedCount: 0,
      updatedCount: 0,
      deliveryFailedCount: 0,
      failedCount: 1,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        status: "FAILED",
        deliveryCheckCount: 2,
        providerCheckedAt: now,
        errorCode: "SMS_DELIVERY_REPORT_API_FAILED",
        errorMessage: "provider unavailable",
      },
    });
    expect(createInstallationIssue).toHaveBeenCalledWith(expect.objectContaining({
      installationOrderId: "order-1",
      type: "CUSTOMER_ASSIGNMENT_SMS_SEND_FAILED",
      title: "SMS 도달 실패",
      description: "provider unavailable",
    }));
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

function assignmentRequestNotification(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "notification-1",
    installationOrderId: "order-1",
    assignmentAttemptId: "assignment-1",
    smsType: "INSTALLER_ASSIGNMENT_REQUEST",
    smsTemplateKey: "installer_assignment_request",
    recipientPhoneEncrypted: encryptPii("010-1234-5678"),
    smsBody: "※ {responseDeadline}까지 회신이 없으면 다른 기사님께 자동으로 배정됩니다.",
    retryCount: 0,
    pushSentAt: null,
    ...overrides,
  };
}
