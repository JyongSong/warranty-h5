import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const notFoundPath = join(process.cwd(), "src", "app", "not-found.tsx");

describe("global not found page", () => {
  it("guides users back to the home page only", () => {
    expect(existsSync(notFoundPath)).toBe(true);

    const source = readFileSync(notFoundPath, "utf8");
    expect(source).toContain("페이지를 찾을 수 없습니다");
    expect(source).not.toContain("필요한 메뉴는 홈에서 다시 선택해 주세요.");
    expect(source).toContain('href="/"');
    expect(source).not.toContain('href="/backoffice/installations"');
    expect(source).not.toContain("설치 주문으로 이동");
  });
});
