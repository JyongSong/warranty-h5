import { describe, expect, it } from "vitest";
import { closeBackofficeTablePageSizeMenu } from "./BackofficeTablePagination";

describe("closeBackofficeTablePageSizeMenu", () => {
  it("closes the open page size dropdown", () => {
    const details = { open: true };

    closeBackofficeTablePageSizeMenu(details);

    expect(details.open).toBe(false);
  });
});
