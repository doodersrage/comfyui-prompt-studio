"use client";

import { useCallback, useState } from "react";
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export default function ControlNetTool() {
  const { shared, updateShared } = useCachedSettings("character", DEFAULT_CHARACTER_TOOL_CACHE);
  const [mode, setMode] = useState<ControlNetMode>("depth");
  const [subject, setSubject] = useState("");
  const [scene, setScene] = useState("");
  const [detail, setDetail] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [source, setSource] = useState<"text" | "vision" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRefChange = useCallback((file: File | null) => {
    if (refPreview) {
      URL.revokeObjectURL(refPreview);
    }
    setRefFile(file);
    setRefPreview(file ? URL.createObjectURL(file) : null);
  }, [refPreview]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        mode,
        subject,
        scene,
        detail,
        model: shared.model,
        detailLevel: shared.detail,
      };
      if (refFile) {
        payload.image = await fileToDataUrl(refFile);
        payload.mimeType = refFile.type || "image/jpeg";
      }

      const response = await fetch("/api/controlnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        source?: "text" | "vision";
      };
      if (!response.ok) {
        throw new Error(data.error ?? "ControlNet prompt failed.");
      }
      setOutput(data.prompt ?? "");
      setSource(data.source ?? (refFile ? "vision" : "text"));
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
      description="Structure-focused prompts for depth, pose, canny, normal, and lineart conditioning. Upload a reference image for vision-assisted structure extraction."
    >
      <SharedToolControls
        shared={shared}
        onModelChange={(model) => updateShared({ model })}
        onDetailChange={(detail) => updateShared({ detail })}
        recommendFromText={output}
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

      <ToolSection title="Reference image (optional)">
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onRefChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {refPreview ? (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={refPreview}
              alt="ControlNet reference"
              className="max-h-48 rounded-lg border border-zinc-800 object-contain"
            />
            <Button variant="ghost" onClick={() => onRefChange(null)}>
              Remove image
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            When uploaded, vision extracts structure and merges it with the selected ControlNet mode.
          </p>
        )}
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
              placeholder="e.g. woman standing, weight on left leg, arms crossed — or leave blank when using image"
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
          <Button
            loading={loading}
            disabled={!subject.trim() && !refFile}
            onClick={() => void generate()}
          >
            Build ControlNet prompt
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ToolSection>

      {output ? (
        <ToolSection title="Result">
          {source === "vision" ? (
            <p className="mb-2 text-xs text-cyan-300/80">Generated from reference image + {mode} mode</p>
          ) : null}
          <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-200">
            {output}
          </pre>
        </ToolSection>
      ) : null}
    </ToolLayout>
  );
}
