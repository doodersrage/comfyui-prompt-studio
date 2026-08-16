import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARDING_STEPS,
  isOnboardingChromeStep,
  isOnboardingCoreStep,
  isOnboardingStepAccessible,
} from "./onboarding-store";

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
        "first-queue-success",
        "review-gallery",
      ],
    );
    for (const step of core) {
      assert.ok(step.href, `${step.id} should have an href`);
    }
    assert.equal(
      ONBOARDING_STEPS.find((step) => step.id === "first-queue-success")?.label,
      "Land your first completed render",
    );
    assert.ok(
      !ONBOARDING_STEPS.some((step) => /Simple mode/i.test(step.label)),
    );
    assert.equal(
      ONBOARDING_STEPS.find((step) => step.id === "system-workflows")?.href,
      "/settings?tab=comfyui&section=connection",
    );
  });

  it("keeps chrome tips separate from MVP path", () => {
    const chrome = ONBOARDING_STEPS.filter((step) =>
      isOnboardingChromeStep(step.id),
    );
    assert.ok(chrome.length >= 3);
    assert.ok(chrome.every((step) => !isOnboardingCoreStep(step.id)));
  });

  it("filters steps by allowed features", () => {
    const galleryOnly = ONBOARDING_STEPS.filter((step) =>
      isOnboardingStepAccessible(step, ["gallery"]),
    );
    assert.ok(galleryOnly.some((step) => step.id === "review-gallery"));
    assert.ok(!galleryOnly.some((step) => step.id === "first-queue"));
    assert.ok(galleryOnly.every((step) => isOnboardingStepAccessible(step, ["gallery"])));
  });
});
