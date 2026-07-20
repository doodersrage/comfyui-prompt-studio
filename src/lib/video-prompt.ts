export type VideoPromptRequest = {
  subject: string;
  motion?: string;
  camera?: string;
  durationSec?: number;
  style?: string;
};

export function buildVideoPrompt(request: VideoPromptRequest): string {
  const subject = request.subject.trim();
  const motion = request.motion?.trim();
  const camera = request.camera?.trim();
  const style = request.style?.trim();
  const duration =
    typeof request.durationSec === "number" && request.durationSec > 0
      ? `${request.durationSec}s clip`
      : "short clip";

  const parts = [
    `${duration}.`,
    subject ? `Subject/action: ${subject}.` : "",
    motion ? `Motion: ${motion}.` : "",
    camera ? `Camera: ${camera}.` : "Camera: stable cinematic framing with gentle movement.",
    style ? `Look: ${style}.` : "",
    "Maintain temporal continuity; avoid flicker, morphing faces, and abrupt scene cuts.",
  ];
  return parts.filter(Boolean).join(" ");
}
