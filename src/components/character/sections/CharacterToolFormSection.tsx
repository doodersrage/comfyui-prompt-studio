'use client';

import SceneSetupSection from '@/components/scene-tool/SceneSetupSection';
import { CharacterToolModeSection } from '@/components/character/sections/CharacterToolModeSection';
import { CharacterToolPresetsSection } from '@/components/character/sections/CharacterToolPresetsSection';
import { CharacterToolHintsGenerateSection } from '@/components/character/sections/CharacterToolHintsGenerateSection';
import type { useCharacterToolOrchestration } from '@/hooks/useCharacterToolOrchestration';

type CharacterToolViewModel = ReturnType<typeof useCharacterToolOrchestration>;

export function CharacterToolFormSection(vm: CharacterToolViewModel) {
  const { mounted, sceneMode, accent, toolSettings, updateToolSettings, updateShared } = vm;

  return (
    <SceneSetupSection description="Pick a mode, add hints, then generate.">
      <CharacterToolModeSection sceneMode={sceneMode} updateToolSettings={updateToolSettings} />
      <CharacterToolPresetsSection
        mounted={mounted}
        sceneMode={sceneMode}
        accent={accent}
        toolSettings={toolSettings}
        updateToolSettings={updateToolSettings}
        updateShared={updateShared}
      />
      <CharacterToolHintsGenerateSection {...vm} />
    </SceneSetupSection>
  );
}
