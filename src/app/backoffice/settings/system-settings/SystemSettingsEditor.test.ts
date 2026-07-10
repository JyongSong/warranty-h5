import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SystemSettingsEditor from "./SystemSettingsEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  updateSystemSettingAction: vi.fn(),
}));

describe("SystemSettingsEditor", () => {
  it("renders values read-only with an edit action per row", () => {
    const html = renderToStaticMarkup(
      createElement(SystemSettingsEditor, {
        settings: [
          {
            key: "installation.dispatcher.enabled",
            value: "true",
            effectiveValue: "true",
            valueStatus: "stored",
            validationHint: "true 또는 false",
            description: "설치 dispatcher cron 실행 여부",
          },
          {
            key: "installation.dispatcher.limit.sendInstallationNotifications",
            value: "",
            effectiveValue: "10",
            valueStatus: "missing",
            validationHint: "1-50 사이의 정수",
            description: "pending 설치 SMS 발송 최대 처리 건수",
          },
        ],
      }),
    );

    expect(html).toContain("설명");
    expect(html).toContain("작업");
    expect(html).toContain("저장값");
    expect(html).toContain("적용값");
    expect(html).toContain("편집");
    expect(html).toContain("installation.dispatcher.enabled");
    expect(html).toContain("설치 dispatcher cron 실행 여부");
    expect(html).toContain("installation.dispatcher.limit.sendInstallationNotifications");
    expect(html).toContain("pending 설치 SMS 발송 최대 처리 건수");
    expect(html).toContain("미설정");
    expect(html).toContain("whitespace-nowrap");
    expect(html).not.toContain("break-all text-zinc-700");
    expect(html).not.toContain("whitespace-pre-wrap");
    expect(html).not.toContain('name="value"');
    expect(html).not.toContain("시스템 설정 편집");
  });
});
