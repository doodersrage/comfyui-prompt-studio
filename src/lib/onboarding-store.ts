import {
  readBrowserValue,
  writeBrowserValue,
} from "./browser-storage";

export type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
};

const KEY = "comfy-onboarding-v1";

export const ONBOARDING_STEPS: Omit<OnboardingStep, "done">[] = [
  { id: "llm-health", label: "Run LLM health check in Settings" },
  { id: "comfy-health", label: "Run ComfyUI health check in Settings" },
  { id: "import-workflow", label: "Import or configure a ComfyUI workflow" },
  { id: "first-generate", label: "Generate your first prompt" },
  { id: "first-queue", label: "Queue a prompt to ComfyUI" },
  { id: "review-gallery", label: "Rate an output in Gallery review mode" },
];

export function loadOnboardingState(): OnboardingStep[] {
  if (typeof window === "undefined") {
    return ONBOARDING_STEPS.map((step) => ({ ...step, done: false }));
  }
  const saved = readBrowserValue<Record<string, boolean>>(KEY) ?? {};
  return ONBOARDING_STEPS.map((step) => ({
    ...step,
    done: Boolean(saved[step.id]),
  }));
}

export function markOnboardingStepDone(stepId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const saved = readBrowserValue<Record<string, boolean>>(KEY) ?? {};
  saved[stepId] = true;
  writeBrowserValue(KEY, saved);
}

export function onboardingComplete(): boolean {
  return loadOnboardingState().every((step) => step.done);
}

export function dismissOnboarding(): void {
  if (typeof window === "undefined") {
    return;
  }
  const saved: Record<string, boolean> = {};
  for (const step of ONBOARDING_STEPS) {
    saved[step.id] = true;
  }
  writeBrowserValue(KEY, saved);
}
