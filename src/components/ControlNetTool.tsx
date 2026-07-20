"use client";

import { useState } from "react";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { DEFAULT_CHARACTER_TOOL_CACHE } from "@/lib/settings-cache";
import type { ControlNetMode } from "@/lib/controlnet-prompt";

const MODES: { id: ControlNetMode; label: string }[] = [
  { id: "depth", label: "Depth" },
  { id: "pose", label: "Pose" },
  { id: "canny", label: "Canny / edges" },
  { id: "normal", label: "Normal map" },
  { id: "lineart", label: "Lineart" },
];

export default function ControlNetTool() {
  const { shared, updateShared } = useCachedSettings("character", DEFAULT_CHARACTER_TOOL_CACHE);
  const [mode, setMode] = useState<ControlNetMode>("depth");
  const [subject, setSubject] = useState("");
  const [scene, setScene] = useState("");
  const [detail, setDetail] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/controlnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, subject, scene, detail }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "ControlNet prompt failed.");
      }
      setOutput(data.prompt ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ControlNet prompt failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolLayout
      accent="cyan"
      badge={<ToolBadge accent="cyan">ControlNet</ToolBadge>}
      title="ControlNet prompt builder"
      description="Structure-focused prompts for depth, pose, canny, normal, and lineart conditioning."
    >
      <SharedToolControls
        shared={shared}
        onModelChange={(model) => updateShared({ model })}
        onDetailChange={(detail) => updateShared({ detail })}
      />

      <ToolSection title="Conditioning mode">
        <div className="flex flex-wrap gap-2">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              className={`ui-chip ${mode === entry.id ? "ui-chip-active" : ""}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </ToolSection>

      <ToolSection title="Structure description">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="controlnet-subject">Subject structure</FieldLabel>
            <textarea
              id="controlnet-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              rows={4}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              placeholder="e.g. woman standing, weight on left leg, arms crossed"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-scene">Scene context (optional)</FieldLabel>
            <input
              id="controlnet-scene"
              value={scene}
              onChange={(event) => setScene(event.target.value)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              placeholder="e.g. narrow alley, low camera angle"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-detail">Extra constraints (optional)</FieldLabel>
            <input
              id="controlnet-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <Button loading={loading} onClick={() => void generate()}>
            Build ControlNet prompt
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ToolSection>

      {output ? (
        <ToolSection title="Result">
          <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-200">
            {output}
          </pre>
        </ToolSection>
      ) : null}
    </ToolLayout>
  );
}
