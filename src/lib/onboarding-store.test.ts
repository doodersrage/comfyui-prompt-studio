import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARDING_STEPS,
  isOnboardingChromeStep,
  isOnboardingCoreStep,
} from "./onboarding-store.ts";

describe("onboarding-store", () => {
  it("exposes MVP core steps with deep links", () => {
    const core = ONBOARDING_STEPS.filter((step) => isOnboardingCoreStep(step.id));
    assert.deepEqual(
      core.map((step) => step.id),
      [
        "llm-health",
        "comfy-health",
        "system-workflows",
        "first-generate",
        "first-queue",
        "review-gallery",
      ],
    );
    for (const step of core) {
      assert.ok(step.href, `${step.id} should have an href`);
    }
  });

  it("keeps chrome tips separate from MVP path", () => {
    const chrome = ONBOARDING_STEPS.filter((step) =>
      isOnboardingChromeStep(step.id),
    );
    assert.ok(chrome.length >= 3);
    assert.ok(chrome.every((step) => !isOnboardingCoreStep(step.id)));
  });
});
