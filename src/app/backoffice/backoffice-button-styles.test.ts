import { describe, expect, it } from "vitest";
import { getBackofficeButtonClass } from "./backoffice-button-styles";

describe("getBackofficeButtonClass", () => {
  it("uses a filled dark style for normal actions", () => {
    const className = getBackofficeButtonClass("primary");

    expect(className).toContain("bg-zinc-950");
    expect(className).toContain("text-white");
    expect(className).not.toContain("border-zinc-300");
  });

  it("reserves the outline style for secondary controls", () => {
    const className = getBackofficeButtonClass("secondary");

    expect(className).toContain("border-zinc-300");
    expect(className).toContain("bg-white");
    expect(className).toContain("text-zinc-700");
  });

  it("distinguishes destructive actions from their secondary launcher", () => {
    expect(getBackofficeButtonClass("danger")).toContain("bg-red-600");
    expect(getBackofficeButtonClass("dangerSecondary")).toContain("border-red-200");
  });

  it("applies the requested size without changing the semantic variant", () => {
    const className = getBackofficeButtonClass("primary", "lg");

    expect(className).toContain("h-10");
    expect(className).toContain("bg-zinc-950");
  });
});
