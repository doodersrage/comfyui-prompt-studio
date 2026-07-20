import { defineConfig } from "@playwright/test";

const baseURL = process.env.PROMPT_API_URL ?? "http://127.0.0.1:47832";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL,
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
