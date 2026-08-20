import { describe, expect, it } from "vitest";
import { FALLBACK_AFTER_HOURS } from "@/lib/installation/customer/timing";
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
      "설치 예약 정보를 입력해 주세요.\n" +
        "\n" +
        "주문 상품: Aqara 스마트 도어락 K100 x1 외\n" +
        "\n" +
        "아래 링크에서 설치 희망일과 주소를 입력해 주세요.\n" +
        "\n" +
        "https://example.com/i/c/token-1\n" +
        "\n" +
        `※ ${FALLBACK_AFTER_HOURS}시간 이내 미입력 시 주문하신 배송지 정보로 설치가 진행됩니다.\n` +
        "\n" +
        "※ 발신전용",
    );
  });

  it("shows only the first order product followed by 외 when SMS product summary has multiple products", () => {
    const content = buildCustomerReservationLinkSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1 / 월패드 연동(RF447) x1",
      reservationUrl: "https://example.com/i/c/token-1",
    });

    expect(content.text).toContain("주문 상품: Aqara 스마트 도어락 K100 x1 외");
    expect(content.text).not.toContain("용역 출장비 x1");
    expect(content.text).not.toContain("월패드 연동(RF447) x1");
  });

  it("builds customer reservation reminder content from the JSON template", () => {
    const content = buildCustomerReservationReminderSmsContent({
      productSummary: "Aqara 스마트 도어락 K100 x1",
      reservationUrl: "https://example.com/i/c/token-2",
    });

    expect(content.templateKey).toBe("customer_reservation_reminder");
    // 브랜드 표기는 본문이 아니라 LMS 제목에 있다.
    expect(content.text).not.toContain("[아카라 라이프]");
    expect(content.subject).toBe("[아카라라이프] 설치 예약 안내");
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
      branchName: "강남점",
      installerPhone: "01099990000",
    });

    expect(content.templateKey).toBe("customer_assignment_confirmed");
    expect(content.text).not.toContain("홍길동");
    expect(content.text).toBe(
      "*발신전용\n" +
        "아카라라이프 설치 배정완료\n" +
        "강남점 010-9999-0000\n" +
        "배정된 기사님이 곧 연락드릴 예정입니다.\n" +
        "\n" +
        "※ 월패드 연동을 희망하시는 경우 해피콜 시 기사님께 말씀 부탁드립니다.\n" +
        "현장에서 기사님이 설치 환경을 확인 후 연동 가능 여부를 안내해드리며, 추가 비용 발생 시 작업 내용 및 금액을 현장에서 안내해드립니다.\n" +
        "\n" +
        "※ 월패드 연동이 불가한 경우에도 기사 출장비(3만원)는 발생하며, 해당 사유로 도어락 구매를 취소하실 경우 왕복 택배비가 발생합니다.\n" +
        "해당 조건에 동의하지 않으시는 경우 기사 방문 전 고객센터로 연락 주시면 취소 및 환불을 도와드리겠습니다.",
    );
    expect(content.text).not.toContain("주문 상품");
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
