'use client';

import dynamic from 'next/dynamic';
import DiffusersSamplingReadout from '@/components/DiffusersSamplingReadout';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model-resolution-defaults';
import {
  formatQueueQualityProfileLabel,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { SystemWorkflowChoiceDescription } from '@/lib/system-workflow-runtime';

const QueueRecipesPanel = dynamic(() => import('@/components/QueueRecipesPanel'), {
  ssr: false,
  loading: () => null,
});

export type SharedQueueQualityBlockProps = {
  cloudEngine: boolean;
  systemPathActive: boolean;
  roleplayVariant: boolean;
  queueQualityProfile: QueueQualityProfile;
  lockedVariationSeed?: string;
  systemWorkflowChoice: SystemWorkflowChoiceDescription | null;
  toolId?: string;
  shared: SharedToolSettings;
  recipesShared: SharedToolSettings;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  onRecipesApplied: (next: SharedToolSettings) => void;
};

export default function SharedQueueQualityBlock({
  cloudEngine,
  systemPathActive,
  roleplayVariant,
  queueQualityProfile,
  lockedVariationSeed,
  systemWorkflowChoice,
  toolId,
  shared,
  recipesShared,
  resolutionOrientation,
  resolutionSizeTier,
  onRecipesApplied,
}: SharedQueueQualityBlockProps) {
  if (cloudEngine) {
    return (
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Cloud engines use the prompt and size from this tool. Draft/Final/Max do not patch a Comfy
        graph.
      </p>
    );
  }

  if (!systemPathActive) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p
        data-testid="queue-seed-quality-clarity"
        className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]"
      >
        Queue uses{' '}
        <span className="font-medium text-[var(--text-primary)]">
          {formatQueueQualityProfileLabel(queueQualityProfile)}
        </span>
        {' · '}
        {lockedVariationSeed?.trim()
          ? `pinned seed ${lockedVariationSeed.trim().slice(0, 24)}${lockedVariationSeed.trim().length > 24 ? '…' : ''}`
          : 'new seed each send'}
      </p>
      {systemWorkflowChoice ? (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Graph:{' '}
          <span className="text-[var(--text-secondary)]">{systemWorkflowChoice.display}</span>
        </p>
      ) : null}
      {roleplayVariant ? null : (
        <QueueRecipesPanel
          toolId={toolId}
          shared={recipesShared}
          qualityProfile={queueQualityProfile}
          orientation={resolutionOrientation}
          sizeTier={resolutionSizeTier}
          systemWorkflowSource={systemWorkflowChoice?.source}
          onApplied={onRecipesApplied}
        />
      )}
      {shared.inferenceEngine === 'diffusers' && !roleplayVariant ? (
        <DiffusersSamplingReadout
          model={shared.model}
          checkpointMap={shared.modelCheckpointMap}
          toolId={toolId ?? 'generate'}
          workshopCrop={shared.diffusersWorkshopCrop ?? 'auto'}
        />
      ) : null}
    </div>
  );
}
