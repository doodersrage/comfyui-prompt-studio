import type { WorkflowPlaceholderTokens } from "./comfyui-config";
import {
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
  type ComfyWorkflowFile,
} from "./comfyui-workflow-files";
import { loadSettingsCache } from "./settings-cache";
import { resolveQueueParams } from "./queue-params-settings";
import { optimizeWorkflowForQueue } from "./workflow-queue-optimizer";

export type OptimizeAllWorkflowsResult = {
  updated: number;
  skipped: number;
  warnings: string[];
  files: ComfyWorkflowFile[];
};

export function optimizeAllWorkflowsInLibrary(input: {
  tokens: WorkflowPlaceholderTokens;
  model?: string;
}): OptimizeAllWorkflowsResult {
  const shared = loadSettingsCache().shared;
  const model = input.model ?? shared.model;
  const queueParams = resolveQueueParams({
    model,
    qualityProfile: shared.queueQualityProfile,
  });
  const files = loadComfyWorkflowFiles();
  const warnings: string[] = [];
  let updated = 0;
  let skipped = 0;
  const saved: ComfyWorkflowFile[] = [];

  for (const file of files) {
    const sourceJson = file.workflowJson.trim();
    if (!sourceJson) {
      skipped += 1;
      warnings.push(`Skipped “${file.name}” — empty JSON.`);
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      skipped += 1;
      warnings.push(`Skipped “${file.name}” — invalid JSON.`);
      continue;
    }

    const result = optimizeWorkflowForQueue({
      workflow: parsed,
      tokens: input.tokens,
      model,
      qualityProfile: shared.queueQualityProfile,
      upscaleModelFilename: queueParams.upscaleModelFilename,
      refinerCheckpointFilename: queueParams.refinerCheckpointFilename,
    });

    if (result.workflowJson === sourceJson && result.bindingChanges.length === 0) {
      skipped += 1;
      saved.push(file);
      continue;
    }

    saved.push(
      upsertComfyWorkflowFile({
        id: file.id,
        createdAt: file.createdAt,
        name: file.name,
        filename: file.filename,
        workflowJson: result.workflowJson,
      }),
    );
    updated += 1;

    if (result.audit.warnings.length > 0) {
      warnings.push(
        `“${file.name}”: ${result.audit.warnings.length} review note(s) after optimize.`,
      );
    }
  }

  return { updated, skipped, warnings, files: saved };
}
