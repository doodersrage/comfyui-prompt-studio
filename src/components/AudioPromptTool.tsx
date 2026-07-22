"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import MobileStickyQueueBar from "@/components/MobileStickyQueueBar";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { DEFAULT_AUDIO_MODEL } from "@/lib/comfy-models/client";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import {
  AUDIO_SECONDS_TOKEN,
  buildAudioPrompt,
} from "@/lib/audio-mesh-prompt";
import { DEFAULT_AUDIO_TOOL_CACHE } from "@/lib/settings-cache";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "sky" as const;

export default function AudioPromptTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("audio", DEFAULT_AUDIO_TOOL_CACHE);
  const subject = toolSettings?.subject ?? "";
  const mood = toolSettings?.mood ?? "";
  const instruments = toolSettings?.instruments ?? "";
  const durationSec = toolSettings?.durationSec ?? 10;

  const actions = usePromptResultActions({
    tool: "audio",
    model: shared.model,
    detail: shared.detail,
    hints: subject,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (getComfyModelDefinition(shared.model).category !== "audio") {
      updateShared({ model: DEFAULT_AUDIO_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const output = useMemo(
    () => buildAudioPrompt({ subject, mood, instruments, durationSec }),
    [durationSec, instruments, mood, subject],
  );

  const [copied, setCopied] = useState(false);
  const copyOutput = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [output]);

  if (!mounted) {
    return null;
  }

  const controlsModel =
    getComfyModelDefinition(shared.model).category === "audio"
      ? shared.model
      : DEFAULT_AUDIO_MODEL;
  const controlsShared =
    controlsModel === shared.model ? shared : { ...shared, model: controlsModel };
  const selectedModel = getComfyModelDefinition(controlsModel);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Audio · {selectedModel.comfyNode}</ToolBadge>}
      title="Audio prompt"
      description="Describe sound for Stable Audio (or BYO audio packs). Queues with {{AUDIO_SECONDS}} when the workflow exposes it."
      sidebar={
        <SharedToolControls
          toolId="audio"
          shared={controlsShared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Subject / scene sound</FieldLabel>
        <TextArea
          rows={3}
          value={subject}
          onChange={(event) => updateToolSettings({ subject: event.target.value })}
          placeholder="Rain on a tin roof with distant thunder…"
          className={accentFocusClass(ACCENT)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Mood</FieldLabel>
            <TextInput
              value={mood}
              onChange={(event) => updateToolSettings({ mood: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instruments / texture</FieldLabel>
            <TextInput
              value={instruments}
              onChange={(event) =>
                updateToolSettings({ instruments: event.target.value })
              }
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>
        <label className="mt-3 block space-y-1 text-xs text-zinc-400">
          Duration (seconds)
          <TextInput
            type="number"
            min={1}
            max={120}
            value={String(durationSec)}
            onChange={(event) =>
              updateToolSettings({
                durationSec: Math.max(1, Number(event.target.value) || 10),
              })
            }
            className={accentFocusClass(ACCENT)}
          />
        </label>
        <PrimaryButton
          className="mt-4"
          accentClassName={accentButtonClass(ACCENT)}
          disabled={!output.trim()}
          onClick={() =>
            void actions.sendComfyUi(output, undefined, undefined, {
              customTokens: [
                { token: AUDIO_SECONDS_TOKEN, value: String(durationSec) },
              ],
              queueParamsBase: { /* audio seconds via token */ },
            })
          }
        >
          Queue audio
        </PrimaryButton>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={output ? "template" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={controlsModel}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        onSaveHistory={() => actions.saveHistory({ prompt: output, hints: subject })}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            customTokens: [
              { token: AUDIO_SECONDS_TOKEN, value: String(durationSec) },
            ],
          })
        }
        {...promptResultPreviewProps(actions, output)}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        historySaved={actions.historySaved}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue audio"
        status={actions.comfyUiStatus}
        onQueue={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            customTokens: [
              { token: AUDIO_SECONDS_TOKEN, value: String(durationSec) },
            ],
          })
        }
      />
    </ToolLayout>
  );
}
