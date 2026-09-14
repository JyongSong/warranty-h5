import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "../../../../../../vercel.json";
import { GET } from "@/app/api/internal/cron/send-surveys/route";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobStatus: { update: vi.fn(), upsert: vi.fn() },
    backofficeSetting: { findUnique: vi.fn() },
    cronJobRunLock: { updateMany: vi.fn(), create: vi.fn() },
    warrantyRegistration: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));

const settingFindUnique = vi.mocked(prisma.backofficeSetting.findUnique);
const lockUpdateMany = vi.mocked(prisma.cronJobRunLock.updateMany);
const lockRelease = vi.mocked(prisma.cronJobRunLock.updateMany);
const registrationFindMany = vi.mocked(prisma.warrantyRegistration.findMany);
const registrationUpdate = vi.mocked(prisma.warrantyRegistration.update);
const cronStatusUpdate = vi.mocked(prisma.cronJobStatus.update);
const sendSmsMock = vi.mocked(sendSms);

function cronRequest() {
  return new Request("http://localhost/api/internal/cron/send-surveys", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function registration(id: string, confirmedAtIso: string) {
  return { id, userPhone: `0101234${id}`, confirmedAt: new Date(confirmedAtIso) };
}

describe("GET /api/internal/cron/send-surveys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    // 09-14(월) 15:00 KST
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T06:00:00.000Z"));

    settingFindUnique.mockResolvedValue({ value: "true" } as never);
    lockUpdateMany.mockResolvedValue({ count: 1 } as never);
    registrationFindMany.mockResolvedValue([] as never);
    registrationUpdate.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("영업일 15시(KST)에 돌도록 Vercel cron 에 등록한다", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/internal/cron/send-surveys",
      // 06:00 UTC = 15:00 KST
      schedule: "0 6 * * 1-5",
    });
  });

  it("cron 토큰이 없으면 아무것도 하지 않는다", async () => {
    const response = await GET(new Request("http://localhost/api/internal/cron/send-surveys"));

    expect(response.status).toBe(401);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("시스템 설정이 꺼져 있으면 보내지 않는다", async () => {
    settingFindUnique.mockResolvedValue({ value: "false" } as never);

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({
      ok: true,
      job: "survey/send-surveys",
      skipped: true,
      reason: "CRON_DISABLED",
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("설정 자체가 없으면 꺼진 것으로 본다", async () => {
    settingFindUnique.mockResolvedValue(null as never);

    const response = await GET(cronRequest());

    expect((await response.json()).reason).toBe("CRON_DISABLED");
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("공휴일에는 보내지 않는다", async () => {
    // 추석 당일 15:00 KST
    vi.setSystemTime(new Date("2026-09-25T06:00:00.000Z"));

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({
      ok: true,
      job: "survey/send-surveys",
      skipped: true,
      reason: "NOT_BUSINESS_DAY",
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(cronStatusUpdate).toHaveBeenCalledWith({
      where: { key: "survey.autoSend" },
      data: {
        lastFinishedAt: expect.any(Date),
        lastStatus: "DISABLED",
        lastDurationMs: null,
        lastErrorCode: "NOT_BUSINESS_DAY",
      },
    });
  });

  it("이미 돌고 있으면 겹쳐 보내지 않는다", async () => {
    lockUpdateMany.mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.cronJobRunLock.create).mockRejectedValue({ code: "P2002" } as never);

    const response = await GET(cronRequest());

    expect((await response.json()).reason).toBe("JOB_LOCKED");
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("7영업일이 지난 건만 보내고 발송 시각을 남긴다", async () => {
    registrationFindMany.mockResolvedValue([
      registration("due", "2026-09-02T01:00:00.000Z"), // 7영업일 경과
      registration("early", "2026-09-04T01:00:00.000Z"), // 6영업일
    ] as never);

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({
      ok: true,
      job: "survey/send-surveys",
      scanned: 2,
      due: 1,
      sent: 1,
      failed: 0,
      remaining: 0,
    });
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock.mock.calls[0][0]).toBe("0101234due");
    expect(sendSmsMock.mock.calls[0][1]).toContain("/satisfaction-survey?id=due");
    expect(registrationUpdate).toHaveBeenCalledWith({
      where: { id: "due" },
      data: { surveySentAt: expect.any(Date) },
    });
    expect(lockRelease).toHaveBeenCalled();
  });
});
