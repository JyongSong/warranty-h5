import { describe, expect, it } from "vitest";
import {
  CUSTOMER_REQUEST_TOKEN_TTL_HOURS,
  FALLBACK_AFTER_HOURS,
  REMINDER_AFTER_HOURS,
  REMINDER_TOKEN_TTL_HOURS,
} from "@/lib/installation/customer/timing";

describe("customer input timeline", () => {
  // 카카오 알림톡 "설치 예약 정보 입력 안내" 본문에 "48시간"이 고정 문구로
  // 심사 통과돼 있다. 이 값을 바꾸려면 카카오 템플릿을 재심사해야 하므로
  // 조용히 바뀌지 않도록 못박아 둔다.
  it("pins the fallback window to the hours printed in the approved alimtalk template", () => {
    expect(FALLBACK_AFTER_HOURS).toBe(48);
  });

  it("reminds before the fallback fires", () => {
    expect(REMINDER_AFTER_HOURS).toBeLessThan(FALLBACK_AFTER_HOURS);
  });

  it("keeps a live link across the whole window", () => {
    // 최초 링크는 리마인더 시점까지, 리마인더 링크는 폴백 시점까지 살아 있어야
    // 고객이 어느 시점에 눌러도 만료된 링크를 보지 않는다.
    expect(CUSTOMER_REQUEST_TOKEN_TTL_HOURS).toBe(REMINDER_AFTER_HOURS);
    expect(REMINDER_AFTER_HOURS + REMINDER_TOKEN_TTL_HOURS).toBe(FALLBACK_AFTER_HOURS);
  });
});
