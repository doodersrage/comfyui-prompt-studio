'use client';

import { ToolSection } from '@/components/ui/ToolPageShell';
import { StudioPresetsSaveSection } from '@/components/studio/tabs/presets/StudioPresetsSaveSection';
import { StudioPresetsPacksSection } from '@/components/studio/tabs/presets/StudioPresetsPacksSection';
import { StudioPresetsStartersSection } from '@/components/studio/tabs/presets/StudioPresetsStartersSection';
import { StudioPresetsIdentitySection } from '@/components/studio/tabs/presets/StudioPresetsIdentitySection';
import { StudioPresetsListSection } from '@/components/studio/tabs/presets/StudioPresetsListSection';

export type StudioPresetsTabProps = {
  accent: import('@/lib/tool-theme').ToolAccent;
  shared: import('@/lib/settings-cache').SharedToolSettings;
  toolSettings: import('@/lib/settings-cache').StudioToolCache;
  compareHints: string;
  filledTemplate: string;
  presetName: string;
  presetHints: string;
  presetPackName: string;
  sceneStarterPackName: string;
  identityBundleName: string;
  scenePresets: import('@/lib/scene-presets').ScenePreset[];
  userSceneStarters: import('@/lib/user-scene-starter-presets').UserSceneStarterPreset[];
  copiedPresetShareId: string | null;
  onPresetNameChange: (name: string) => void;
  onPresetHintsChange: (hints: string) => void;
  onPresetPackNameChange: (name: string) => void;
  onSceneStarterPackNameChange: (name: string) => void;
  onIdentityBundleNameChange: (name: string) => void;
  onScenePresetsChange: (presets: import('@/lib/scene-presets').ScenePreset[]) => void;
  onUserSceneStartersChange: (
    presets: import('@/lib/user-scene-starter-presets').UserSceneStarterPreset[]
  ) => void;
  onCompareHintsChange: (hints: string) => void;
  onCopiedPresetShareIdChange: (id: string | null) => void;
  onUpdateShared: (partial: Partial<import('@/lib/settings-cache').SharedToolSettings>) => void;
  onUpdateToolSettings: (partial: Partial<import('@/lib/settings-cache').StudioToolCache>) => void;
  onBackupStatusChange: (status: string) => void;
  onApplyIdentityBundle: (
    bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle
  ) => void;
  onOpenCharacterWithIdentity: (
    bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle
  ) => void;
};

export default function StudioPresetsTab(props: StudioPresetsTabProps) {
  return (
    <ToolSection>
      <StudioPresetsSaveSection {...props} />
      <StudioPresetsPacksSection {...props} />
      <StudioPresetsStartersSection {...props} />
      <StudioPresetsIdentitySection {...props} />
      <StudioPresetsListSection {...props} />
    </ToolSection>
  );
}
