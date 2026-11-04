import { describe, expect, it } from "vitest";
import {
  canEditBackoffice,
  canManageBackofficeSettings,
  canViewBackoffice,
  isAssignableBackofficeLevel,
} from "./backofficeRoles";

describe("backoffice roles", () => {
  it.each([
    // level, view, edit, settings
    [0, false, false, false],
    [1, true, true, true],
    [2, true, true, false],
    [3, true, false, false],
    [4, false, false, false],
  ])("level %i → view %s / edit %s / settings %s", (level, view, edit, settings) => {
    expect(canViewBackoffice(level)).toBe(view);
    expect(canEditBackoffice(level)).toBe(edit);
    expect(canManageBackofficeSettings(level)).toBe(settings);
  });

  it("only lets 1-3 be assigned", () => {
    expect([0, 1, 2, 3, 4].filter(isAssignableBackofficeLevel)).toEqual([1, 2, 3]);
  });
});
