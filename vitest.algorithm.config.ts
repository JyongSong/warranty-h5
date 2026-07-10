import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/lib/installation/installer/matcher.test.ts",
      "src/lib/installation/installer/source.test.ts",
      "src/lib/installation/orders/source/source-items.test.ts",
      "src/lib/installation/installer/dispatch.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/installation/installer/matcher.ts",
        "src/lib/installation/installer/source.ts",
        "src/lib/installation/orders/source/source-items.ts",
        "src/lib/installation/installer/dispatch.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ["text"],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
    },
  },
});
