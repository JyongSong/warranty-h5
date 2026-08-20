import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdminApi } from "@/lib/adminAuth";
import { findInstallerByBranch } from "@/lib/dispatch";
import { getSmsTemplateBody } from "@/lib/smsTemplate";
import { POST } from "./route";

const {
  settingCreateMock,
  settingFindManyMock,
  settingFindUniqueMock,
  settingUpdateMock,
  queryRawMock,
  sendMock,
  transactionMock,
  isAlimtalkEnabledMock,
} = vi.hoisted(() => ({
  settingCreateMock: vi.fn(),
  settingFindManyMock: vi.fn(),
  settingFindUniqueMock: vi.fn(),
  settingUpdateMock: vi.fn(),
  queryRawMock: vi.fn(),
  sendMock: vi.fn(),
  transactionMock: vi.fn(),
  isAlimtalkEnabledMock: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/lib/dispatch", () => ({
  findInstallerByBranch: vi.fn(),
}));

vi.mock("@/lib/smsTemplate", () => ({
  DEFAULT_ASSIGNMENT_SMS_TEMPLATE: "default",
  SMS_TEMPLATE_KEYS: { ASSIGNMENT: "assignment_completed" },
  getSmsTemplateBody: vi.fn(),
  renderTemplate: vi.fn((body: string) => body),
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

vi.mock("@/lib/notifications/alimtalk-options", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/notifications/alimtalk-options")
  >("@/lib/notifications/alimtalk-options");
  return { ...actual, isAlimtalkEnabled: isAlimtalkEnabledMock };
});

vi.mock("solapi", () => ({
  SolapiMessageService: class {
    send = sendMock;
  },
}));

const requireAdminApiMock = vi.mocked(requireAdminApi);
const findInstallerByBranchMock = vi.mocked(findInstallerByBranch);
const getSmsTemplateBodyMock = vi.mocked(getSmsTemplateBody);
const originalEnv = process.env;

describe("POST /api/send-assignment-sms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      SOLAPI_API_KEY: "api-key",
      SOLAPI_API_SECRET: "api-secret",
      SOLAPI_SENDER: "0212345678",
      SOLAPI_KAKAO_PF_ID: "KA01PF260706032300158y6gaHPMaEfL",
    };
    isAlimtalkEnabledMock.mockResolvedValue(false);
    requireAdminApiMock.mockResolvedValue({
      admin: { id: "admin-1", name: "admin", level: 1 },
      errorResponse: null,
    });
    findInstallerByBranchMock.mockReturnValue({
      branchName: "강남점",
      phone: "01011112222",
    });
    getSmsTemplateBodyMock.mockResolvedValue("hello");
    settingFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([{ value: "1" }]);
    settingCreateMock.mockResolvedValue({ key: "audit-key" });
    settingFindUniqueMock.mockResolvedValue({
      value: JSON.stringify({
        schemaVersion: 1,
        adminId: "admin-1",
        fileName: "recipients.xlsx",
        recipientCount: 1,
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
    sendMock.mockResolvedValue({});
    transactionMock.mockImplementation(async (callback) =>
      callback({
        $queryRaw: queryRawMock,
        backofficeSetting: { create: settingCreateMock },
      }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("requires level one before reading the upload", async () => {
    requireAdminApiMock.mockResolvedValue({
      admin: null,
      errorResponse: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/send-assignment-sms", { method: "POST" }),
    );

    expect(response.status).toBe(403);
    expect(requireAdminApiMock).toHaveBeenCalledWith(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects files above the configured byte limit before parsing", async () => {
    settingFindManyMock.mockResolvedValue([
      { key: "backoffice.sms.assignment.maxFileBytes", value: "1024" },
    ]);
    const request = requestWithFile(new File([new Uint8Array(1025)], "recipients.xlsx"));

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "SMS_FILE_TOO_LARGE" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects recipient lists above the per-request limit without sending", async () => {
    settingFindManyMock.mockResolvedValue([
      { key: "backoffice.sms.assignment.maxRecipientsPerRequest", value: "1" },
    ]);
    const request = requestWithRows([
      { 지점명: "강남점", 연락처: "01022223333" },
      { 지점명: "강남점", 연락처: "01033334444" },
    ]);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "SMS_RECIPIENT_LIMIT_EXCEEDED" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reserves the daily budget, sends, and completes the audit for a valid level-one request", async () => {
    const request = requestWithRows([{ 지점명: "강남점", 연락처: "01022223333" }]);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, sent: 1, failed: 0 });
    expect(sendMock).toHaveBeenCalledWith({
      to: "01022223333",
      from: "0212345678",
      text: "hello",
    });
    const updateArgs = settingUpdateMock.mock.calls[0]?.[0];
    expect(updateArgs.where.key).toMatch(/^backoffice\.sms\.assignment\.audit\./);
    expect(JSON.parse(updateArgs.data.value)).toEqual(
      expect.objectContaining({
        sentCount: 1,
        failedCount: 0,
        status: "COMPLETED",
        completedAt: expect.any(String),
      }),
    );
  });

  it("sends plain SMS with no kakaoOptions while the alimtalk switch is off", async () => {
    const response = await POST(requestWithRows([{ 지점명: "강남점", 연락처: "01022223333" }]));

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith({
      to: "01022223333",
      from: "0212345678",
      text: "hello",
    });
    expect(await response.json()).toMatchObject({
      results: [expect.objectContaining({ ok: true, channel: "SMS" })],
    });
  });

  it("attaches the assignment_completed kakaoOptions once the switch is on", async () => {
    isAlimtalkEnabledMock.mockResolvedValue(true);

    const response = await POST(requestWithRows([{ 지점명: "강남점", 연락처: "01022223333" }]));

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith({
      to: "01022223333",
      from: "0212345678",
      // 카카오 발송이 실패하면 이 text 로 SMS 대체발송된다.
      text: "hello",
      kakaoOptions: {
        pfId: "KA01PF260706032300158y6gaHPMaEfL",
        templateId: "KA01TP26070707483285849dA5feTIvF",
        variables: {
          "#{branchName}": "강남점",
          "#{installerPhone}": "01011112222",
        },
        disableSms: false,
      },
    });
    expect(await response.json()).toMatchObject({
      results: [expect.objectContaining({ ok: true, channel: "ALIMTALK" })],
    });
  });

  it("degrades that row to plain SMS when a template variable is blank", async () => {
    isAlimtalkEnabledMock.mockResolvedValue(true);
    // 공백뿐인 연락처는 라우트의 !installer.phone 검사를 통과하지만
    // 알림톡은 빈 변수를 허용하지 않는다. 이때 배치 전체가 아니라 해당 행만
    // SMS 로 내려가야 한다.
    findInstallerByBranchMock.mockReturnValue({ branchName: "강남점", phone: "   " });

    const response = await POST(requestWithRows([{ 지점명: "강남점", 연락처: "01022223333" }]));

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith({
      to: "01022223333",
      from: "0212345678",
      text: "hello",
    });
    expect(await response.json()).toMatchObject({
      sent: 1,
      results: [expect.objectContaining({ ok: true, channel: "SMS" })],
    });
  });
});

function requestWithRows(rows: Array<Record<string, string>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "A S수리입력");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return requestWithFile(new File([buffer], "recipients.xlsx"));
}

function requestWithFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new NextRequest("http://localhost/api/send-assignment-sms", {
    method: "POST",
    body: formData,
  });
}
