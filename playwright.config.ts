import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

function loadEnvLocal(): void {
  const path = resolve(__dirname, ".env.local");
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const baseURL = process.env.PROMPT_API_URL ?? "http://127.0.0.1:47832";
const authStorage = resolve(__dirname, "e2e/.auth/user.json");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Parallel workers + next dev race on navigation (ERR_ABORTED).
  workers: process.env.CI ? 1 : undefined,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "off",
    storageState: existsSync(authStorage) ? authStorage : undefined,
  },
  webServer: {
    // Production server avoids Fast Refresh aborting in-flight navigations under CI.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_PLAYWRIGHT: "1",
    },
  },
});
