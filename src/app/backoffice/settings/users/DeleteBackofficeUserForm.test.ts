import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteBackofficeUserForm } from "./DeleteBackofficeUserForm";

describe("DeleteBackofficeUserForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prevents delete submission when the confirmation is cancelled", () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);

    const element = DeleteBackofficeUserForm({
      action: vi.fn(),
      userEmail: "user@example.com",
      userId: "user-1",
    });
    expect(isValidElement(element)).toBe(true);

    const preventDefault = vi.fn();
    (element.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault });

    expect(confirmMock).toHaveBeenCalledWith("user@example.com 유저를 삭제할까요?");
    expect(preventDefault).toHaveBeenCalled();
  });

  it("allows delete submission when the confirmation is accepted", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const element = DeleteBackofficeUserForm({
      action: vi.fn(),
      userEmail: "user@example.com",
      userId: "user-1",
    });
    const preventDefault = vi.fn();
    (element.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
