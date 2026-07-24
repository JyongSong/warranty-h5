import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260724000000_secure_cafe24_tokens_with_rls/migration.sql",
  ),
  "utf8",
);

describe("cafe24_tokens RLS migration", () => {
  it("enables RLS on cafe24_tokens", () => {
    expect(migration).toContain(
      'ALTER TABLE IF EXISTS "cafe24_tokens" ENABLE ROW LEVEL SECURITY;',
    );
  });

  it("revokes Data API access from cafe24_tokens", () => {
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "cafe24_tokens" FROM anon, authenticated;',
    );
  });
});
