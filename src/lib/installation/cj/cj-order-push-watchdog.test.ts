import { beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "../../../../vercel.json";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
  CJ_PUSH_ALERT_STATE_KEY,
  checkCjOrderPush,
  parseAlertPhones,
} from "@/lib/installation/cj/cj-order-push-watchdog";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobStatus: { findUnique: vi.fn() },
    backofficeSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));

const statusFind = vi.mocked(prisma.cronJobStatus.findUnique);
const settingFind = vi.mocked(prisma.backofficeSetting.findUnique);
const settingUpsert = vi.mocked(prisma.backofficeSetting.upsert);
const settingDelete = vi.mocked(prisma.backofficeSetting.deleteMany);
const sendSmsMock = vi.mocked(sendSms);

const NOW = new Date("2026-11-17T03:45:00Z"); // 12:45 KST
const PHONES = ["01011112222", "01033334444"];

function lastReceived(hoursAgo: number) {
  statusFind.mockResolvedValue({ lastCalledAt: new Date(NOW.getTime() - hoursAgo * 3600_000) } as never);
}
// backoffice_settings: 받는 번호(cj.orderPush.alertPhones)와 알림 상태 키
function settings({ phones = PHONES.join(","), alertedAt = null }: { phones?: string | null; alertedAt?: string | null }) {
  settingFind.mockImplementation((async ({ where }: { where: { key: string } }) => {
    if (where.key === "cj.orderPush.alertPhones") return phones === null ? null : { value: phones };
    if (where.key === CJ_PUSH_ALERT_STATE_KEY) return alertedAt === null ? null : { value: alertedAt };
    return null;
  }) as never);
}

describe("checkCjOrderPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("한 번도 안 들어왔으면 알리지 않는다", async () => {
    statusFind.mockResolvedValue(null);
    expect(await checkCjOrderPush({ now: NOW })).toEqual({ state: "NEVER_RECEIVED" });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("10시간 미만이면 아무것도 안 한다", async () => {
    lastReceived(9.9);
    settings({});
    const result = await checkCjOrderPush({ now: NOW });
    expect(result).toMatchObject({ state: "OK", hoursSince: 9, sent: null });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it("10시간째 끊기면 모든 번호로 한 번 알리고 상태를 남긴다", async () => {
    lastReceived(10.2);
    settings({});
    const result = await checkCjOrderPush({ now: NOW });
    expect(result).toMatchObject({ state: "STALE", hoursSince: 10, sent: "ALERT", recipients: 2 });
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock.mock.calls[0][0]).toBe("01011112222");
    // 마지막 수신 11/16 17:33 UTC = 11/17 02:33 KST
    expect(sendSmsMock.mock.calls[0][1]).toContain("10시간째");
    expect(sendSmsMock.mock.calls[0][1]).toContain("11/17 02:33");
    expect(settingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: CJ_PUSH_ALERT_STATE_KEY } }),
    );
  });

  it("이미 알렸으면 같은 장애 동안 다시 보내지 않는다", async () => {
    lastReceived(15);
    settings({ alertedAt: "2026-11-17T00:45:00.000Z" });
    const result = await checkCjOrderPush({ now: NOW });
    expect(result).toMatchObject({ state: "STALE", sent: null });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("알린 뒤 다시 들어오면 복구 문자를 보내고 상태를 지운다", async () => {
    lastReceived(0.5);
    settings({ alertedAt: "2026-11-17T00:45:00.000Z" });
    const result = await checkCjOrderPush({ now: NOW });
    expect(result).toMatchObject({ state: "OK", sent: "RECOVERY" });
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock.mock.calls[0][1]).toContain("복구");
    expect(settingDelete).toHaveBeenCalledWith({ where: { key: CJ_PUSH_ALERT_STATE_KEY } });
  });

  it("받는 번호가 없으면 보내지도, 상태를 바꾸지도 않는다", async () => {
    lastReceived(20);
    settings({ phones: null });
    const result = await checkCjOrderPush({ now: NOW });
    expect(result).toMatchObject({ state: "STALE", sent: null, recipients: 0 });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(settingUpsert).not.toHaveBeenCalled();
  });
});

describe("parseAlertPhones", () => {
  it("쉼표·세미콜론·줄바꿈으로 나누고 숫자만 남기며 중복을 없앤다", () => {
    expect(parseAlertPhones(" 010-1111-2222; 01011112222 ,,abc\n010 3333 4444")).toEqual([
      "01011112222",
      "01033334444",
    ]);
    expect(parseAlertPhones(undefined)).toEqual([]);
  });
});

describe("vercel.json", () => {
  it("매시 45분에 끊김 확인을 부른다", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/internal/cron/cj-push-watchdog",
      schedule: "45 * * * *",
    });
  });
});
