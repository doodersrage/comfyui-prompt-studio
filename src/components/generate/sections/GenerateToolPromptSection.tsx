'use client';

import SceneSetupSection from '@/components/scene-tool/SceneSetupSection';
import { accentButtonClass } from '@/components/ui/ToolPageShell';
import { FieldError } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { GenerateToolHintInputSection } from '@/components/generate/sections/GenerateToolSceneSetupSection';
import { GenerateToolSceneSetupCollapsible } from '@/components/generate/sections/GenerateToolSceneSetupCollapsible';
import type { useGenerateToolOrchestration } from '@/hooks/useGenerateToolOrchestration';

const ACCENT = 'brand' as const;

type GenerateToolViewModel = ReturnType<typeof useGenerateToolOrchestration>;
type GenerateToolPromptSectionProps = GenerateToolViewModel;

export function GenerateToolPromptSection({
  mounted,
  toolSettings,
  updateToolSettings,
  updateShared,
  mode,
  loading,
  error,
  hintSource,
  historySeedScope,
  includePeople,
  wildness,
  queueModel,
  variationEnabled,
  variationStrength,
  distinctPeople,
  input,
  setInput,
  setHintSource,
  submitDisabled,
  submitDisabledReason,
  generateRandom,
  generate,
  setModeAndCache,
  setDistinctPeople,
  setVariationEnabled,
  setVariationStrength,
}: GenerateToolPromptSectionProps) {
  return (
    <SceneSetupSection
      title="Prompt"
      description="Write a scene idea, or use Random surprise if you have nothing in mind — then queue."
    >
      <GenerateToolHintInputSection
        toolSettings={toolSettings}
        updateToolSettings={updateToolSettings}
        mode={mode}
        input={input}
        setInput={setInput}
        hintSource={hintSource}
        historySeedScope={historySeedScope}
        queueModel={queueModel}
        setHintSource={setHintSource}
      />
      <GenerateToolSceneSetupCollapsible
        toolSettings={toolSettings}
        updateToolSettings={updateToolSettings}
        updateShared={updateShared}
        mode={mode}
        input={input}
        setInput={setInput}
        hintSource={hintSource}
        includePeople={includePeople}
        wildness={wildness}
        distinctPeople={distinctPeople}
        variationEnabled={variationEnabled}
        variationStrength={variationStrength}
        setModeAndCache={setModeAndCache}
        setDistinctPeople={setDistinctPeople}
        setVariationEnabled={setVariationEnabled}
        setVariationStrength={setVariationStrength}
      />
      <div className="ui-cta-block">
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            type="button"
            data-action="primary-generate"
            onClick={() => void generate()}
            disabled={submitDisabled}
            loading={loading}
            loadingLabel={
              hintSource === 'random' ? 'Generating random scene' : 'Generating scene prompt'
            }
            title={submitDisabledReason ?? undefined}
            aria-disabled={submitDisabled}
          >
            {hintSource === 'random' ? 'Generate random scene' : 'Generate scene prompt'}
          </PrimaryButton>
          {hintSource !== 'random' ? (
            <Button
              type="button"
              variant="secondary"
              data-action="random-surprise"
              disabled={!mounted || loading}
              onClick={() => {
                setHintSource('random');
                void generateRandom();
              }}
            >
              Random surprise
            </Button>
          ) : null}
        </div>

        {submitDisabledReason && !loading && <FieldError>{submitDisabledReason}</FieldError>}
        {error && <FieldError>{error}</FieldError>}
      </div>
    </SceneSetupSection>
  );
}
