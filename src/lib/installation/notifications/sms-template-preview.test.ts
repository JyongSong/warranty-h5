import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInstallationSmsTemplatePreviews,
  renderInstallationSmsTemplatePreview,
} from "@/lib/installation/notifications/sms-template-preview";

describe("installation SMS template preview", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("lists JSON-backed SMS templates with extracted variables", () => {
    const templates = getInstallationSmsTemplatePreviews();

    expect(templates.map((template) => template.key)).toEqual([
      "customer_reservation_link",
      "customer_reservation_reminder",
      "customer_assignment_confirmed",
      "installer_assignment_request",
      "installer_happycall_guide",
    ]);
    expect(templates[0]).toMatchObject({
      label: "고객 설치 예약 링크",
      audience: "고객",
      filePath: "src/lib/installation/notifications/sms-template-customer-reservation-link.json",
      variables: ["productSummary", "reservationUrl", "fallbackHours"],
    });
  });

  it("renders selected template with provided variables", () => {
    const rendered = renderInstallationSmsTemplatePreview("installer_assignment_request", {
      addressMain: "서울 강남구",
      installDate: "2026-06-20",
      responseUrl: "https://example.com/i/i/token-1",
      responseDeadline: "8월 21일(금) 14시",
    });

    expect(rendered).toBe(
      "아카라라이프 설치 기사로 등록하신 기사님께 설치 배정 요청드립니다.\n" +
        "\n" +
        "설치 희망일: 2026-06-20\n" +
        "지역: 서울 강남구\n" +
        "\n" +
        "아래 링크에서 설치 가능 여부를 선택해 주세요.\n" +
        "\n" +
        "https://example.com/i/i/token-1\n" +
        "\n" +
        "※ 8월 21일(금) 14시까지 회신이 없으면 다른 기사님께 자동으로 배정됩니다.\n" +
        "\n" +
        "※ 발신전용",
    );
  });

  it("keeps reservation links as standalone https URLs separated by blank lines", () => {
    const rendered = renderInstallationSmsTemplatePreview("customer_reservation_link", {
      productSummary: "Aqara 스마트 도어락 K100 x1 외",
      reservationUrl: "https://example.com/i/c/token-1",
      fallbackHours: "48",
    });

    expect(rendered).toContain(
      "주문 상품: Aqara 스마트 도어락 K100 x1 외\n\n" +
        "아래 링크에서 설치 희망일과 주소를 입력해 주세요.\n\n" +
        "https://example.com/i/c/token-1\n\n",
    );
  });

  it("uses NEXT_PUBLIC_BASE_URL for preview link variables", () => {
    process.env.NEXT_PUBLIC_BASE_URL = " https://h5.example.com/ ";

    const templates = getInstallationSmsTemplatePreviews();

    expect(templates.find((template) => template.key === "customer_reservation_link")?.sampleVars).toMatchObject({
      reservationUrl: "https://h5.example.com/i/c/customer-token",
    });
    expect(templates.find((template) => template.key === "customer_reservation_reminder")?.sampleVars).toMatchObject({
      reservationUrl: "https://h5.example.com/i/c/reminder-token",
    });
    expect(templates.find((template) => template.key === "installer_assignment_request")?.sampleVars).toMatchObject({
      responseUrl: "https://h5.example.com/i/i/installer-token",
    });
  });
});
