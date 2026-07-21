import {
  formatQueuePipelineStatusNotes,
  type QueueQualityProfile,
} from "./queue-quality-profile";

/** Join base status parts with model/profile pipeline notes. */
export function joinQueueStatusNotes(
  parts: Array<string | null | undefined>,
  pipeline?: {
    model?: string;
    qualityProfile?: QueueQualityProfile;
    tool?: string;
  },
): string {
  const fromPipeline = pipeline
    ? formatQueuePipelineStatusNotes(pipeline)
    : [];
  return [...parts, ...fromPipeline].filter(Boolean).join(" · ");
}
