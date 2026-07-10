import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLATION_DISPATCHER_CRON_JOB,
  recordCronJobFinished,
} from "@/lib/cron/status";

const { cronJobStatusUpdate, executeRawUnsafe } = vi.hoisted(() => ({
  cronJobStatusUpdate: vi.fn(),
  executeRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: executeRawUnsafe,
    cronJobStatus: {
      update: cronJobStatusUpdate,
    },
  },
}));

describe("cron status recording", () => {
  beforeEach(() => {
    cronJobStatusUpdate.mockReset();
    executeRawUnsafe.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("records the latest cron finish status without writing run history", async () => {
    const startedAt = new Date("2026-06-25T02:13:00.000Z");
    const finishedAt = new Date("2026-06-25T02:13:05.000Z");

    cronJobStatusUpdate.mockResolvedValue({
      lastCalledAt: new Date("2026-06-25T02:12:55.000Z"),
    });

    await recordCronJobFinished(
      INSTALLATION_DISPATCHER_CRON_JOB,
      "SUCCESS",
      startedAt,
      null,
      finishedAt,
    );

    expect(cronJobStatusUpdate).toHaveBeenCalledWith({
      where: { key: "installation.dispatcher" },
      data: {
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastStatus: "SUCCESS",
        lastDurationMs: 5000,
        lastErrorCode: null,
      },
    });
    expect(executeRawUnsafe).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
