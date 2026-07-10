import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInstallationSmsDeliveryReport,
  sendInstallationSmsOrThrow,
} from "@/lib/installation/notifications/sms-sender";

const {
  getMessages,
  send,
  getSystemSettingValue,
} = vi.hoisted(() => ({
  getMessages: vi.fn(),
  send: vi.fn(),
  getSystemSettingValue: vi.fn(),
}));

vi.mock("solapi", () => ({
  SolapiMessageService: vi.fn(function SolapiMessageService() {
    return { getMessages, send };
  }),
}));

vi.mock("@/lib/backoffice/system-settings", () => ({
  SYSTEM_SETTING_KEYS: {
    installationSmsDeliveryMode: "installation.sms.deliveryMode",
    installationSmsTestPhoneNumber: "installation.sms.testPhoneNumber",
  },
  getSystemSettingValue,
}));

describe("sendInstallationSmsOrThrow", () => {
  beforeEach(() => {
    process.env.SOLAPI_API_KEY = "test-api-key";
    process.env.SOLAPI_API_SECRET = "test-api-secret";
    process.env.SOLAPI_SENDER = "01099998888";
    getMessages.mockReset();
    send.mockReset();
    getSystemSettingValue.mockReset();
    getMessages.mockResolvedValue({
      messageList: {
        "message-1": {
          messageId: "message-1",
          status: "COMPLETE",
          statusCode: "2000",
          reason: null,
          dateReported: "2026-06-11T00:09:00.000Z",
        },
      },
    });
    send.mockResolvedValue({
      messageList: [{ messageId: "message-1" }],
    });
    getSystemSettingValue.mockImplementation(async (key: string) => {
      if (key === "installation.sms.deliveryMode") return "production";
      return null;
    });
  });

  it("sends to the real recipient in production delivery mode", async () => {
    const result = await sendInstallationSmsOrThrow("010-1234-5678", "hello");

    expect(result).toEqual({ providerMessageId: "message-1" });
    expect(send).toHaveBeenCalledWith(
      { to: "01012345678", from: "01099998888", text: "hello" },
      { showMessageList: true }
    );
    expect(getSystemSettingValue).toHaveBeenCalledWith("installation.sms.deliveryMode");
  });

  it("sends to each configured test recipient in test delivery mode", async () => {
    getSystemSettingValue.mockImplementation(async (key: string) => {
      if (key === "installation.sms.deliveryMode") return "test";
      if (key === "installation.sms.testPhoneNumber") return "010-1111-2222, 01033334444";
      return null;
    });

    const result = await sendInstallationSmsOrThrow("010-1234-5678", "hello");

    expect(result).toEqual({ providerMessageId: "message-1" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      { to: "01011112222", from: "01099998888", text: "hello" },
      { showMessageList: true }
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      { to: "01033334444", from: "01099998888", text: "hello" },
      { showMessageList: true }
    );
  });

  it("rejects all SMS in disabled delivery mode", async () => {
    getSystemSettingValue.mockImplementation(async (key: string) => {
      if (key === "installation.sms.deliveryMode") return "disabled";
      return null;
    });

    await expect(sendInstallationSmsOrThrow("010-1234-5678", "hello")).rejects.toThrow(
      "SMS_DISABLED_BY_SYSTEM_SETTING",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a missing delivery mode as disabled", async () => {
    getSystemSettingValue.mockResolvedValue(null);

    await expect(sendInstallationSmsOrThrow("010-1234-5678", "hello")).rejects.toThrow(
      "SMS_DISABLED_BY_SYSTEM_SETTING",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("gets a delivery report by provider message id", async () => {
    const result = await getInstallationSmsDeliveryReport("message-1");

    expect(getMessages).toHaveBeenCalledWith({ messageId: "message-1" });
    expect(result).toEqual({
      messageId: "message-1",
      status: "COMPLETE",
      statusCode: "2000",
      reason: null,
      dateReported: "2026-06-11T00:09:00.000Z",
    });
  });
});
