import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  classifyUploadError,
  isAutoFlushable,
  nextStatus,
  readStatus,
  resetForRetry,
  type QueueEntryStatus,
} from "./completionQueueState";

const pending: QueueEntryStatus = {
  state: "PENDING",
  attempts: 0,
  lastError: null,
  lastTriedAt: null,
};

const NOW = new Date("2026-09-10T04:00:00.000Z");

describe("readStatus", () => {
  it("예전 버전이 저장한 항목(필드 없음)을 대기 상태로 읽는다", () => {
    // IndexedDB 버전을 올리지 않고 필드만 늘렸으므로, 이미 기사 휴대폰에
    // 쌓여 있던 항목이 업그레이드 직후에도 그대로 전송돼야 한다.
    expect(readStatus(undefined)).toEqual(pending);
    expect(readStatus({})).toEqual(pending);
  });

  it("저장된 상태를 그대로 읽는다", () => {
    expect(
      readStatus({ state: "FAILED", attempts: 3, lastError: "NETWORK", lastTriedAt: "t" }),
    ).toEqual({ state: "FAILED", attempts: 3, lastError: "NETWORK", lastTriedAt: "t" });
  });

  it("망가진 값은 안전한 기본값으로 떨어뜨린다", () => {
    expect(readStatus({ attempts: -1 } as never).attempts).toBe(0);
    expect(readStatus({ state: "WAT" } as never).state).toBe("PENDING");
  });
});

describe("nextStatus", () => {
  it("성공하면 항목을 지운다", () => {
    expect(nextStatus(pending, { ok: true }, NOW)).toEqual({ action: "DELETE" });
  });

  it("재시도 가능한 실패는 횟수만 올리고 대기로 남긴다", () => {
    const decision = nextStatus(pending, { ok: false, retriable: true, error: "NETWORK" }, NOW);
    expect(decision).toEqual({
      action: "KEEP",
      status: {
        state: "PENDING",
        attempts: 1,
        lastError: "NETWORK",
        lastTriedAt: NOW.toISOString(),
      },
    });
  });

  it("재시도 불가한 실패도 지우지 않고 FAILED 로 남긴다", () => {
    // 기사가 올린 완료 등록이 사진까지 조용히 사라지던 동작을 막는 지점이다.
    const decision = nextStatus(
      pending,
      { ok: false, retriable: false, error: "ORDER_NOT_SUBMITTABLE" },
      NOW,
    );
    expect(decision.action).toBe("KEEP");
    if (decision.action !== "KEEP") throw new Error("unreachable");
    expect(decision.status.state).toBe("FAILED");
    expect(decision.status.lastError).toBe("ORDER_NOT_SUBMITTABLE");
  });

  it("재시도 상한에 닿으면 FAILED 로 바꿔 자동 전송을 멈춘다", () => {
    const almost = { ...pending, attempts: MAX_ATTEMPTS - 1 };
    const decision = nextStatus(almost, { ok: false, retriable: true, error: "NETWORK" }, NOW);
    if (decision.action !== "KEEP") throw new Error("unreachable");
    expect(decision.status.attempts).toBe(MAX_ATTEMPTS);
    expect(decision.status.state).toBe("FAILED");
  });

  it("상한 직전까지는 계속 대기 상태다", () => {
    const before = { ...pending, attempts: MAX_ATTEMPTS - 2 };
    const decision = nextStatus(before, { ok: false, retriable: true, error: "NETWORK" }, NOW);
    if (decision.action !== "KEEP") throw new Error("unreachable");
    expect(decision.status.state).toBe("PENDING");
  });
});

describe("isAutoFlushable", () => {
  it("대기 항목만 자동 전송한다", () => {
    expect(isAutoFlushable(pending)).toBe(true);
    expect(isAutoFlushable({ ...pending, state: "FAILED" })).toBe(false);
  });

  it("다시 시도를 누르면 자동 전송 대상으로 돌아온다", () => {
    const failed: QueueEntryStatus = {
      state: "FAILED",
      attempts: MAX_ATTEMPTS,
      lastError: "NETWORK",
      lastTriedAt: NOW.toISOString(),
    };
    expect(isAutoFlushable(failed)).toBe(false);
    expect(isAutoFlushable(resetForRetry())).toBe(true);
  });
});

describe("classifyUploadError", () => {
  const storageError = (status: number) => Object.assign(new Error("boom"), { status });

  it("연결 자체가 안 된 경우는 재시도한다", () => {
    // fetch 가 못 나가면 status 가 없다.
    expect(classifyUploadError(new TypeError("Failed to fetch"))).toEqual({
      retriable: true,
      error: "NETWORK",
    });
    expect(classifyUploadError(undefined)).toEqual({ retriable: true, error: "NETWORK" });
  });

  it("용량 초과는 재시도하지 않는다", () => {
    // 같은 파일을 몇 번 보내도 결과가 같다. 여기서 멈추고 사유를 보여줘야 한다.
    expect(classifyUploadError(storageError(413))).toEqual({
      retriable: false,
      error: "PHOTO_TOO_LARGE",
    });
  });

  it("형식 거부도 재시도하지 않는다", () => {
    expect(classifyUploadError(storageError(415))).toEqual({
      retriable: false,
      error: "PHOTO_TYPE_REJECTED",
    });
  });

  it("그 밖의 4xx 는 영구 실패로 본다", () => {
    expect(classifyUploadError(storageError(400)).retriable).toBe(false);
    expect(classifyUploadError(storageError(404)).retriable).toBe(false);
  });

  it("인증 만료·타임아웃·혼잡은 재시도한다", () => {
    for (const status of [401, 403, 408, 429]) {
      expect(classifyUploadError(storageError(status)).retriable).toBe(true);
    }
  });

  it("서버 오류는 재시도한다", () => {
    expect(classifyUploadError(storageError(500))).toEqual({
      retriable: true,
      error: "STORAGE_UNAVAILABLE",
    });
    expect(classifyUploadError(storageError(503)).retriable).toBe(true);
  });

  it("영구 실패는 첫 시도에서 바로 FAILED 가 된다", () => {
    // 상한(5회)까지 기다리지 않는다는 걸 상태 전이와 함께 확인한다.
    const outcome = { ok: false as const, ...classifyUploadError(storageError(413)) };
    const decision = nextStatus(pending, outcome, NOW);
    if (decision.action !== "KEEP") throw new Error("unreachable");
    expect(decision.status.attempts).toBe(1);
    expect(decision.status.state).toBe("FAILED");
    expect(decision.status.lastError).toBe("PHOTO_TOO_LARGE");
  });
});
