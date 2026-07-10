import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { listSystemSettings } from "@/lib/backoffice/system-settings";
import SystemSettingsPage from "./page";

vi.mock("@/lib/login/backofficeAuth", () => ({
  requireBackofficeUserPage: vi.fn(),
}));

vi.mock("@/lib/backoffice/system-settings", () => ({
  listSystemSettings: vi.fn(),
}));

vi.mock("./actions", () => ({
  updateSystemSettingAction: vi.fn(),
}));

function getRenderedText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getRenderedText).join("");
  if (isValidElement(node)) {
    return getRenderedText((node.props as { children?: unknown }).children);
  }
  return "";
}

function findPropsByComponentName(
  node: unknown,
  componentName: string,
): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPropsByComponentName(child, componentName);
      if (found) return found;
    }
  }

  if (!isValidElement(node)) return null;

  const type = node.type as { name?: string };
  if (type.name === componentName) {
    return node.props as Record<string, unknown>;
  }

  return findPropsByComponentName((node.props as { children?: unknown }).children, componentName);
}

describe("SystemSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(requireBackofficeUserPage).mockReset();
    vi.mocked(listSystemSettings).mockReset();
  });

  it("requires backoffice access and passes only database settings to the editor", async () => {
    vi.mocked(listSystemSettings).mockResolvedValue([
      {
        key: "installation.dispatcher.enabled",
        description: "설치 dispatcher cron 실행 여부",
        value: "true",
        effectiveValue: "true",
        valueStatus: "stored",
        validationHint: "true 또는 false",
      },
      {
        key: "installation.dispatcher.limit.sendInstallationNotifications",
        description: "pending 설치 SMS 발송 최대 처리 건수",
        value: "",
        effectiveValue: "10",
        valueStatus: "missing",
        validationHint: "1-50 사이의 정수",
      },
    ]);

    const element = await SystemSettingsPage();
    const text = getRenderedText(element);
    const editorProps = findPropsByComponentName(element, "SystemSettingsEditor");

    expect(requireBackofficeUserPage).toHaveBeenCalledWith("/backoffice/settings/system-settings", 1);
    expect(listSystemSettings).toHaveBeenCalledOnce();
    expect(editorProps?.settings).toEqual([
      {
        key: "installation.dispatcher.enabled",
        description: "설치 dispatcher cron 실행 여부",
        value: "true",
        effectiveValue: "true",
        valueStatus: "stored",
        validationHint: "true 또는 false",
      },
      {
        key: "installation.dispatcher.limit.sendInstallationNotifications",
        description: "pending 설치 SMS 발송 최대 처리 건수",
        value: "",
        effectiveValue: "10",
        valueStatus: "missing",
        validationHint: "1-50 사이의 정수",
      },
    ]);
    expect(findPropsByComponentName(element, "BackofficePageHeader")).toEqual(
      expect.objectContaining({ title: "시스템 설정" }),
    );
    expect(text).not.toContain("Backoffice");
    expect(text).not.toContain("backoffice_settings");
    expect(text).not.toContain("수정일");
    expect(text).not.toContain("수정자");
  });
});
