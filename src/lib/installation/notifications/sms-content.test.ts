import { describe, expect, it } from "vitest";
import {
  buildCustomerAssignmentConfirmedSmsContent,
  buildCustomerReservationLinkSmsContent,
  buildCustomerReservationReminderSmsContent,
  buildInstallerAssignmentRequestSmsContent,
  buildInstallerHappycallGuideSmsContent,
} from "@/lib/installation/notifications/sms-content";
import customerAssignmentConfirmedTemplate from "@/lib/installation/notifications/sms-template-customer-assignment-confirmed.json";
import customerReservationLinkTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-link.json";
import customerReservationReminderTemplate from "@/lib/installation/notifications/sms-template-customer-reservation-reminder.json";
import installerAssignmentRequestTemplate from "@/lib/installation/notifications/sms-template-installer-assignment-request.json";
import installerHappycallGuideTemplate from "@/lib/installation/notifications/sms-template-installer-happycall-guide.json";

describe("installation SMS content", () => {
  it("keeps one SMS content per JSON template file", () => {
    expect(Object.keys(customerReservationLinkTemplate)).toEqual(["content"]);
    expect(Object.keys(customerReservationReminderTemplate)).toEqual(["content"]);
    expect(Object.keys(customerAssignmentConfirmedTemplate)).toEqual(["content"]);
    expect(Object.keys(installerAssignmentRequestTemplate)).toEqual(["content"]);
    expect(Object.keys(installerHappycallGuideTemplate)).toEqual(["content"]);
  });

  it("builds customer reservation link content from the JSON template", () => {
    const content = buildCustomerReservationLinkSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1",
      reservationUrl: "https://example.com/i/c/token-1",
    });

    expect(content.templateKey).toBe("customer_reservation_link");
    expect(content.text).toBe(
      "[아카라 라이프]\n" +
        "설치 예약 정보를 입력해 주세요.\n" +
        "아래 링크에서 설치 희망 정보를 입력해 주세요.\n" +
        "\n" +
        "주문 상품:\n" +
        "Aqara 스마트 도어락 K100 x1 외\n" +
        "\n" +
        "https://example.com/i/c/token-1\n\n" +
        "※ 발신전용",
    );
  });

  it("shows only the first order product followed by 외 when SMS product summary has multiple products", () => {
    const content = buildCustomerReservationLinkSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1 / 월패드 연동(RF447) x1",
      reservationUrl: "https://example.com/i/c/token-1",
    });

    expect(content.text).toContain("주문 상품:\nAqara 스마트 도어락 K100 x1 외");
    expect(content.text).not.toContain("용역 출장비 x1");
    expect(content.text).not.toContain("월패드 연동(RF447) x1");
  });

  it("builds customer reservation reminder content from the JSON template", () => {
    const content = buildCustomerReservationReminderSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1",
      reservationUrl: "https://example.com/i/c/token-2",
    });

    expect(content.templateKey).toBe("customer_reservation_reminder");
    expect(content.text).toContain("[아카라 라이프]");
    expect(content.text).toContain("설치 예약 정보 입력이 아직 완료되지 않았습니다.");
    expect(content.text).toContain("주문 상품: Aqara 스마트 도어락 K100 x1");
    expect(content.text).toContain("https://example.com/i/c/token-2");
  });

  it("builds installer assignment request content from the JSON template", () => {
    const content = buildInstallerAssignmentRequestSmsContent({
      addressMain: "서울 강남구",
      installDate: "2026-06-20",
      responseUrl: "https://example.com/i/i/token-2",
    });

    expect(content.templateKey).toBe("installer_assignment_request");
    expect(content.text).not.toContain("홍길동");
    expect(content.text).toBe(
      "[아카라 라이프]\n" +
        "설치 가능 여부 확인 요청입니다.\n" +
        "아래 링크에서 설치 가능 여부를 선택해 주세요.\n" +
        "\n" +
        "설치 희망일: 2026-06-20\n" +
        "지역: 서울 강남구\n" +
        "\n" +
        "https://example.com/i/i/token-2\n\n" +
        "※ 발신전용",
    );
  });

  it("builds customer assignment confirmed content from the JSON template", () => {
    const content = buildCustomerAssignmentConfirmedSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1",
    });

    expect(content.templateKey).toBe("customer_assignment_confirmed");
    expect(content.text).not.toContain("홍길동");
    expect(content.text).toBe(
      "[아카라 라이프]\n" +
        "설치 기사 배정이 확정되었습니다.\n" +
        "방문 전 설치 기사가 확인 전화를 드릴 예정입니다.\n" +
        "\n" +
        "주문 상품: Aqara 스마트 도어락 K100 x1 외\n\n" +
        "※ 발신전용",
    );
  });

  it("builds installer happycall guide content from the JSON template", () => {
    const content = buildInstallerHappycallGuideSmsContent({
      address: "서울 강남구 테헤란로 1 12층 1201호",
      customerPhone: "01099990000",
      installDate: "2026-06-20",
      productSummary: "Aqara 스마트 도어락 K100 x1",
    });

    expect(content.templateKey).toBe("installer_happycall_guide");
    expect(content.text).not.toContain("홍길동");
    expect(content.text).toBe(
      "[아카라 라이프]\n" +
        "설치 요청 수락이 완료되었습니다.\n" +
        "48시간 이내 고객에게 확인 전화를 진행해 주세요.\n" +
        "\n" +
        "주문 상품:\n" +
        "Aqara 스마트 도어락 K100 x1\n" +
        "\n" +
        "설치 희망일:\n" +
        "2026-06-20\n" +
        "\n" +
        "주소:\n" +
        "서울 강남구 테헤란로 1 12층 1201호\n" +
        "\n" +
        "고객 전화번호:\n" +
        "010-9999-0000\n\n" +
        "※ 발신전용",
    );
  });
});
