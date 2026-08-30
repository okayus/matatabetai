import { defineConfig } from "@playwright/test";

// e2e は「ビルド成果物を wrangler dev で配信したもの」に対して流す。vite dev ではない。
//
// - vite dev は React Fast Refresh の inline <script> を HTML に注入するので、本番相当の CSP
//   （script-src 'self'）と衝突する。CSP を dev だけ緩めると e2e が本番の配線を見なくなる。
//   ビルド成果物にはその inline script が無い。
// - `wrangler dev --config dist/matatabetai/wrangler.json` は .wrangler/state を config の
//   ディレクトリ相対で解決するので、`--persist-to .wrangler/state` で cwd 相対に固定し、
//   `pnpm db:migrate` が適用したローカル D1 と同じファイルを見せる。
// - サンドボックス（コンテナ）では `localhost` bind が IPv4/IPv6 で止まるので `--ip 127.0.0.1`。
//   ブラウザ側は http://localhost（RP_ID=localhost — RP ID にはドメイン名が要る）で開き、
//   ORIGIN もそれに合わせる（verify の expectedOrigin はバイト一致）。
// - Chromium の sandbox はコンテナ（SYS_ADMIN なし）では初期化できないので DEVCONTAINER のときだけ外す。
// - CI では回さない（virtual authenticator の挙動が headless CI の Chromium で揺れる）。
//   merge 前にコンテナ内で `pnpm e2e` を流す。
//
// vite dev（5173）とは別ポートなので、両方を同時に立てられる。

export const E2E_PORT = 5183;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_INITIAL_REGISTRATION_TOKEN = "e2e-initial-token";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env["DEVCONTAINER"] ? { args: ["--no-sandbox"] } : {},
  },
  webServer: {
    command: "pnpm run e2e:server",
    url: `${E2E_BASE_URL}/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
