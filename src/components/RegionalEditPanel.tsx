"use client";

import { useMemo, useState } from "react";
import InpaintMaskEditor from "@/components/InpaintMaskEditor";
import { Button } from "@/components/ui/Button";
import { ChipButton, FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import {
  createDefaultRegionalSlots,
  formatRegionalSlotsHint,
  normalizeRegionalPromptSlots,
  normalizeRegionalSlotStrength,
  type RegionalPromptSlot,
} from "@/lib/regional-prompt-slots";
import {
  formatRegionalEditHealthChip,
  resolveRegionalEditHealth,
  type RegionalEditHealth,
} from "@/lib/workflow-regional-patch";
import { regionalPromptCustomTokens } from "@/lib/regional-prompt-builder";

type RegionalEditPanelProps = {
  slots: RegionalPromptSlot[];
  onSlotsChange: (slots: RegionalPromptSlot[]) => void;
  sourceImageUrl?: string | null;
  /** Optional live inventory for health chip. */
  availableNodeTypes?: Iterable<string> | null;
  accentClassName?: string;
};

export function regionalSlotsQueueExtras(slots: RegionalPromptSlot[]): {
  customTokens: Array<{ token: string; value: string }>;
  regionalSlots: RegionalPromptSlot[];
} {
  const normalized = normalizeRegionalPromptSlots(slots);
  return {
    customTokens: regionalPromptCustomTokens(
      normalized.map((slot) => ({
        regionId: slot.id,
        prompt: slot.prompt,
      })),
    ),
    regionalSlots: normalized,
  };
}

export default function RegionalEditPanel({
  slots,
  onSlotsChange,
  sourceImageUrl,
  availableNodeTypes,
  accentClassName,
}: RegionalEditPanelProps) {
  const normalized = useMemo(
    () => normalizeRegionalPromptSlots(slots),
    [slots],
  );
  const [activeMaskSlotId, setActiveMaskSlotId] = useState<string | null>(null);
  const [maskFiles, setMaskFiles] = useState<
    Record<string, { file: File | null; previewUrl: string | null }>
  >({});

  const health: RegionalEditHealth = useMemo(
    () =>
      resolveRegionalEditHealth({
        slots: normalized,
        availableNodeTypes,
      }),
    [availableNodeTypes, normalized],
  );

  const updateSlot = (id: string, patch: Partial<RegionalPromptSlot>) => {
    onSlotsChange(
      normalized.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    );
  };

  const healthTone =
    health.status === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : health.status === "fallback-text"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : "border-zinc-700/50 bg-zinc-900/60 text-zinc-400";

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-200">Regional edit</p>
          <p className="mt-1 text-xs text-zinc-500">
            Per-region prompts (+ optional masks). With AttentionCouple /
            RegionalPrompt nodes, slots bind spatially; otherwise{" "}
            <code className="text-zinc-400">{"{{REGION_*}}"}</code> text
            fallback.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${healthTone}`}
          title={health.detail}
        >
          {formatRegionalEditHealthChip(health)}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500">{formatRegionalSlotsHint(normalized)}</p>

      {normalized.map((slot) => (
        <div
          key={slot.id}
          className="space-y-2 rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel>{slot.label}</FieldLabel>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              Strength
              <TextInput
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={String(slot.strength)}
                onChange={(event) =>
                  updateSlot(slot.id, {
                    strength: normalizeRegionalSlotStrength(event.target.value),
                  })
                }
                className={`!min-h-8 w-20 ${accentClassName ?? ""}`}
              />
            </label>
          </div>
          <TextArea
            rows={2}
            value={slot.prompt}
            onChange={(event) => updateSlot(slot.id, { prompt: event.target.value })}
            placeholder={`${slot.label} details…`}
            className={accentClassName}
          />
          {sourceImageUrl ? (
            <div className="flex flex-wrap gap-2">
              <ChipButton
                active={activeMaskSlotId === slot.id}
                onClick={() =>
                  setActiveMaskSlotId((current) =>
                    current === slot.id ? null : slot.id,
                  )
                }
              >
                {slot.maskFilename || maskFiles[slot.id]?.file
                  ? "Edit mask"
                  : "Paint mask"}
              </ChipButton>
              {(slot.maskFilename || maskFiles[slot.id]?.file) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMaskFiles((prev) => {
                      const next = { ...prev };
                      const current = next[slot.id];
                      if (current?.previewUrl?.startsWith("blob:")) {
                        URL.revokeObjectURL(current.previewUrl);
                      }
                      delete next[slot.id];
                      return next;
                    });
                    updateSlot(slot.id, { maskFilename: undefined });
                  }}
                >
                  Clear mask
                </Button>
              )}
            </div>
          ) : null}
          {sourceImageUrl && activeMaskSlotId === slot.id ? (
            <InpaintMaskEditor
              key={`${slot.id}-${sourceImageUrl}`}
              sourceImageUrl={sourceImageUrl}
              onMaskChange={(file, previewUrl) => {
                setMaskFiles((prev) => ({
                  ...prev,
                  [slot.id]: { file, previewUrl },
                }));
                // Filename is assigned at queue upload; stash a local label for UI.
                updateSlot(slot.id, {
                  maskFilename: file ? `region-${slot.id}.png` : undefined,
                });
              }}
            />
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onSlotsChange(createDefaultRegionalSlots())}
        >
          Reset regions
        </Button>
      </div>
    </div>
  );
}

/** Collect mask Files keyed by slot id for queue upload helpers. */
export function regionalSlotMaskFiles(
  slots: RegionalPromptSlot[],
  maskFiles: Record<string, { file: File | null; previewUrl: string | null }>,
): Array<{ slotId: string; file: File }> {
  const out: Array<{ slotId: string; file: File }> = [];
  for (const slot of slots) {
    const file = maskFiles[slot.id]?.file;
    if (file) {
      out.push({ slotId: slot.id, file });
    }
  }
  return out;
}
