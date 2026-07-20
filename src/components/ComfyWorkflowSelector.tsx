"use client";

import type { ComfyWorkflowFile } from "@/lib/comfyui-workflow-files";
import { workflowFileDisplayName } from "@/lib/comfyui-workflow-files";
import type { ServerWorkflowOption } from "@/hooks/useComfyWorkflowSelection";

type ComfyWorkflowSelectorProps = {
  selectedId?: string;
  defaultLabel: string;
  localFiles: ComfyWorkflowFile[];
  serverFiles: ServerWorkflowOption[];
  onChange: (fileId: string | undefined) => void;
  compact?: boolean;
  helpText?: string;
};

export default function ComfyWorkflowSelector({
  selectedId,
  defaultLabel,
  localFiles,
  serverFiles,
  onChange,
  compact = false,
  helpText,
}: ComfyWorkflowSelectorProps) {
  const selectedExists =
    !selectedId ||
    localFiles.some((entry) => entry.id === selectedId) ||
    serverFiles.some((entry) => entry.id === selectedId);

  return (
    <div className={compact ? "space-y-2" : "space-y-3 border-t border-zinc-800 pt-4"}>
      {!compact && (
        <div>
          <p className="text-sm font-medium text-zinc-200">ComfyUI workflow file</p>
          <p className="mt-1 text-xs text-zinc-500">
            {helpText ??
              "Choose which workflow JSON to inject when you Send to ComfyUI. URL, tokens, and queue params still come from Settings or server env."}
          </p>
        </div>
      )}
      <select
        value={selectedId ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={
          compact
            ? "min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            : "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        }
      >
        <option value="">{defaultLabel}</option>
        {serverFiles.length > 0 && (
          <optgroup label="Server workflow files">
            {serverFiles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        )}
        {localFiles.length > 0 && (
          <optgroup label="Imported workflow files">
            {localFiles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {workflowFileDisplayName(entry)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {!selectedExists && (
        <p className="text-xs text-amber-400/90">
          The selected workflow file was removed. Using {defaultLabel.toLowerCase()}.
        </p>
      )}
      {localFiles.length === 0 && serverFiles.length === 0 && !compact && (
        <p className="text-xs text-zinc-600">
          Import workflow JSON files in Settings, or configure{" "}
          <code className="rounded bg-zinc-800 px-1">COMFYUI_WORKFLOW_DIR</code> /
          <code className="rounded bg-zinc-800 px-1">COMFYUI_WORKFLOW_PATHS</code> on
          the server.
        </p>
      )}
    </div>
  );
}
