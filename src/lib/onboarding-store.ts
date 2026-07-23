import {
  readBrowserValue,
  writeBrowserValue,
} from "./browser-storage";
import { settingsTabHref } from "./settings-nav";
import { settingsComfyUiSectionHref } from "./settings-comfyui-nav";

export type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
  /** In-app deep link when the step is actionable. */
  href?: string;
};

const KEY = "comfy-onboarding-v2";
const LEGACY_KEY = "comfy-onboarding-v1";

export const ONBOARDING_STEPS: Omit<OnboardingStep, "done">[] = [
  {
    id: "llm-health",
    label: "Confirm LLM connection in Settings",
    href: settingsTabHref("llm"),
  },
  {
    id: "comfy-health",
    label: "Confirm ComfyUI connection in Settings",
    href: settingsComfyUiSectionHref("connection"),
  },
  {
    id: "system-workflows",
    label: "Enable system workflows (or Heal & ready)",
    href: settingsComfyUiSectionHref("workflow-map"),
  },
  {
    id: "first-generate",
    label: "Generate your first prompt",
    href: "/",
  },
  {
    id: "first-queue",
    label: "Queue a prompt to ComfyUI",
    href: "/queue",
  },
  {
    id: "review-gallery",
    label: "Rate an output in Gallery review mode",
    href: "/gallery?review=1",
  },
  {
    id: "discover-palette",
    label: "Open the command palette (⌘/Ctrl+K)",
  },
  {
    id: "pin-tool",
    label: "Pin a favorite tool in the sidebar (☆)",
  },
  {
    id: "set-density",
    label: "Try Compact density in Profile → Appearance",
    href: "/profile",
  },
  {
    id: "set-workspace",
    label: "Pick Simple / Studio / Full workspace",
    href: "/profile",
  },
];

const CORE_STEP_IDS = new Set([
  "llm-health",
  "comfy-health",
  "system-workflows",
  "first-generate",
  "first-queue",
  "review-gallery",
]);

const CHROME_STEP_IDS = new Set([
  "discover-palette",
  "pin-tool",
  "set-density",
  "set-workspace",
]);

export function isOnboardingCoreStep(id: string): boolean {
  return CORE_STEP_IDS.has(id);
}

export function isOnboardingChromeStep(id: string): boolean {
  return CHROME_STEP_IDS.has(id);
}

function migrateLegacyDoneMap(): Record<string, boolean> {
  const legacy = readBrowserValue<Record<string, boolean>>(LEGACY_KEY);
  if (!legacy || typeof legacy !== "object") {
    return {};
  }
  const migrated: Record<string, boolean> = {};
  for (const step of ONBOARDING_STEPS) {
    if (legacy[step.id]) {
      migrated[step.id] = true;
    }
  }
  // Old "import a workflow" maps to enabling system workflows for the MVP path.
  if (legacy["import-workflow"]) {
    migrated["system-workflows"] = true;
  }
  const legacyComplete = [
    "llm-health",
    "comfy-health",
    "import-workflow",
    "first-generate",
    "first-queue",
    "review-gallery",
    "discover-palette",
    "pin-tool",
    "set-density",
    "set-workspace",
  ].every((id) => Boolean(legacy[id]));
  if (legacyComplete) {
    for (const step of ONBOARDING_STEPS) {
      migrated[step.id] = true;
    }
  }
  return migrated;
}

export function loadOnboardingState(): OnboardingStep[] {
  if (typeof window === "undefined") {
    return ONBOARDING_STEPS.map((step) => ({ ...step, done: false }));
  }
  let saved = readBrowserValue<Record<string, boolean>>(KEY);
  if (!saved || typeof saved !== "object") {
    saved = migrateLegacyDoneMap();
    if (Object.keys(saved).length > 0) {
      writeBrowserValue(KEY, saved);
    }
  }
  return ONBOARDING_STEPS.map((step) => ({
    ...step,
    done: Boolean(saved?.[step.id]),
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
