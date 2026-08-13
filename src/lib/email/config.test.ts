import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEmailConfig } from "./config";
import { overlayEmailConfig } from "./store";
import type { EmailConfig } from "./types";

const envBase = (): EmailConfig => ({
  enabled: false,
  from: "Prompt Studio <noreply@localhost>",
  smtp: { host: "", port: 587, secure: false },
  notifyBatch: true,
  notifyPassword: true,
});

describe("email config", () => {
  it("is disabled without SMTP host", () => {
    const previous = process.env.PROMPT_SMTP_HOST;
    delete process.env.PROMPT_SMTP_HOST;
    delete process.env.PROMPT_EMAIL_ENABLED;
    const config = getEmailConfig();
    assert.equal(config.smtp.host, "");
    assert.equal(config.enabled, false);
    if (previous) {
      process.env.PROMPT_SMTP_HOST = previous;
    }
  });

  it("enables when host and from are set", () => {
    process.env.PROMPT_SMTP_HOST = "smtp.example.com";
    process.env.PROMPT_EMAIL_FROM = "Prompt Studio <noreply@example.com>";
    const config = getEmailConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.smtp.host, "smtp.example.com");
    delete process.env.PROMPT_SMTP_HOST;
    delete process.env.PROMPT_EMAIL_FROM;
  });
});

describe("email stored overlay", () => {
  it("leaves env config unchanged when no overlay is stored", () => {
    const base = envBase();
    assert.deepEqual(overlayEmailConfig(base, null), base);
  });

  it("overlays host, from, and enabled from stored settings", () => {
    const overlaid = overlayEmailConfig(envBase(), {
      enabled: true,
      from: "Studio <alerts@example.com>",
      smtp: { host: "smtp.overlay.test", port: 465, secure: true, user: "mailer" },
    });
    assert.equal(overlaid.enabled, true);
    assert.equal(overlaid.from, "Studio <alerts@example.com>");
    assert.equal(overlaid.smtp.host, "smtp.overlay.test");
    assert.equal(overlaid.smtp.port, 465);
    assert.equal(overlaid.smtp.secure, true);
    assert.equal(overlaid.smtp.user, "mailer");
  });
});
