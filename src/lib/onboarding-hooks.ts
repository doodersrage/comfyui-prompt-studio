import { markOnboardingStepDone } from './onboarding-store';

export function markOnboardingLlmHealthOk(): void {
  markOnboardingStepDone('llm-health');
}

export function markOnboardingComfyHealthOk(): void {
  markOnboardingStepDone('comfy-health');
}

export function markOnboardingSystemWorkflowsEnabled(): void {
  markOnboardingStepDone('system-workflows');
}

/** @deprecated Prefer markOnboardingSystemWorkflowsEnabled for the MVP path. */
export function markOnboardingWorkflowImported(): void {
  markOnboardingSystemWorkflowsEnabled();
}

export function markOnboardingFirstGenerate(): void {
  markOnboardingStepDone('first-generate');
}

export function markOnboardingFirstQueue(): void {
  markOnboardingStepDone('first-queue');
}

/** First completed render in Simple workspace (success metric, not just accept). */
export function markOnboardingFirstQueueSuccess(): boolean {
  return markOnboardingStepDone('first-queue-success');
}

export function markOnboardingGalleryReview(): void {
  markOnboardingStepDone('review-gallery');
}

/** First Moodboard → Day / Roleplay film loop after a still lands. */
export function markOnboardingFirstPlayCampaign(): boolean {
  void import('./play-metrics').then(({ recordFirstPlayCampaignStart }) => {
    recordFirstPlayCampaignStart();
  });
  return markOnboardingStepDone('first-play-campaign');
}

/** First successful Cut film in Day or Roleplay (Play success metric). */
export function markOnboardingFirstFilmCut(): boolean {
  void import('./play-metrics').then(({ recordFirstFilmCut }) => {
    recordFirstFilmCut();
  });
  return markOnboardingStepDone('first-film-cut');
}

export function markOnboardingDiscoverPalette(): void {
  markOnboardingStepDone('discover-palette');
}

export function markOnboardingPinTool(): void {
  markOnboardingStepDone('pin-tool');
}

export function markOnboardingSetDensity(): void {
  markOnboardingStepDone('set-density');
}

export function markOnboardingSetWorkspace(): void {
  markOnboardingStepDone('set-workspace');
}
