import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

function envCredential(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function e2eCredentials(): { username: string; password: string } {
  return {
    username: envCredential("PROMPT_E2E_USERNAME", envCredential("PROMPT_ADMIN_USERNAME", "admin")),
    password: envCredential("PROMPT_E2E_PASSWORD", envCredential("PROMPT_ADMIN_PASSWORD", "admin")),
  };
}

export async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto("/");
  if (page.url().includes("/login")) {
    await loginThroughApi(page);
    return;
  }

  const signInVisible = await page
    .getByRole("heading", { name: "Sign in", exact: true })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (signInVisible) {
    await loginThroughApi(page);
  }
}

async function loginThroughApi(page: Page): Promise<void> {
  const { username, password } = e2eCredentials();
  const response = await page.request.post("/api/auth/login", {
    data: { username, password },
  });
  if (!response.ok()) {
    throw new Error(`E2E login failed (${response.status()}): ${await response.text()}`);
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).not.toBeVisible({
    timeout: 15_000,
  });
}
