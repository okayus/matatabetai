import { defineConfig } from "vitest/config";

// ユニットテストは純粋関数だけ（IO / D1 / HTTP なし）。配線は e2e（Playwright）が見る。
export default defineConfig({
  test: {
    include: ["worker/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
