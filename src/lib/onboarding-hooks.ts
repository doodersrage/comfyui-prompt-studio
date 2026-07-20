import { markOnboardingStepDone } from "./onboarding-store";

export function markOnboardingLlmHealthOk(): void {
  markOnboardingStepDone("llm-health");
}

export function markOnboardingComfyHealthOk(): void {
  markOnboardingStepDone("comfy-health");
}

export function markOnboardingWorkflowImported(): void {
  markOnboardingStepDone("import-workflow");
}

export function markOnboardingFirstGenerate(): void {
  markOnboardingStepDone("first-generate");
}

export function markOnboardingFirstQueue(): void {
  markOnboardingStepDone("first-queue");
}

export function markOnboardingGalleryReview(): void {
  markOnboardingStepDone("review-gallery");
}
