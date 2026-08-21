import { describe, expect, it } from "vitest";
import {
  CUSTOMER_REQUEST_TOKEN_TTL_HOURS,
  FALLBACK_AFTER_HOURS,
  getCustomerFallbackDueAt,
  REMINDER_AFTER_HOURS,
  REMINDER_TOKEN_TTL_HOURS,
} from "@/lib/installation/customer/timing";

describe("customer input timeline", () => {
  // 카카오 알림톡 "설치 예약 정보 입력 안내"/"재안내" 본문에 이 시간이 고정
  // 문구로 들어간다. 값을 바꾸면 템플릿도 재심사해야 하므로 조용히 바뀌지
  // 않도록 못박아 둔다.
  it("pins the fallback window to the hours printed in the alimtalk templates", () => {
    expect(FALLBACK_AFTER_HOURS).toBe(24);
  });

  it("reminds before the fallback fires", () => {
    expect(REMINDER_AFTER_HOURS).toBeLessThan(FALLBACK_AFTER_HOURS);
  });

  it("keeps the link alive past the latest possible fallback", () => {
    // 폴백이 주말로 밀리는데 링크만 먼저 만료되면, 고객은 아직 자동 확정도
    // 안 된 상태에서 만료 화면만 보게 된다.
    const worstCase = FALLBACK_AFTER_HOURS + 48;
    expect(CUSTOMER_REQUEST_TOKEN_TTL_HOURS).toBeGreaterThanOrEqual(worstCase);
    expect(REMINDER_AFTER_HOURS + REMINDER_TOKEN_TTL_HOURS).toBeGreaterThanOrEqual(worstCase);
  });
});

describe("getCustomerFallbackDueAt", () => {
  // KST 기준. 2026-08-19 는 수요일.
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it("is exactly 24h later on a weekday", () => {
    expect(getCustomerFallbackDueAt(kst("2026-08-19T14:00:00")).toISOString()).toBe(
      kst("2026-08-20T14:00:00").toISOString(),
    );
  });

  it("skips Saturday to Monday for a Friday send", () => {
    // 금 14:00 발송 → +24h = 토 14:00 → 월 14:00
    expect(getCustomerFallbackDueAt(kst("2026-08-21T14:00:00")).toISOString()).toBe(
      kst("2026-08-24T14:00:00").toISOString(),
    );
  });

  it("skips Sunday for a Saturday send", () => {
    // 토 10:00 발송 → +24h = 일 10:00 → 월 10:00
    expect(getCustomerFallbackDueAt(kst("2026-08-22T10:00:00")).toISOString()).toBe(
      kst("2026-08-24T10:00:00").toISOString(),
    );
  });

  it("never falls back earlier than the 24h the message promises", () => {
    for (const day of ["17", "18", "19", "20", "21", "22", "23"]) {
      const sentAt = kst(`2026-08-${day}T09:00:00`);
      const due = getCustomerFallbackDueAt(sentAt);
      expect(due.getTime() - sentAt.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    }
  });
});
