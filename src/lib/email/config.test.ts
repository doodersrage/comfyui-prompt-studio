import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEmailConfig } from "./config.ts";

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
