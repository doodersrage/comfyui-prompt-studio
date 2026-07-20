import { generateImagePrompt } from "@/lib/specialized/image-prompt-generator";
import { normalizeDetailLevel } from "@/lib/detail-level";
import { normalizeComfyModel } from "@/lib/comfy-models";
import type { ImagePromptFocus } from "@/lib/specialized/types";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";

export const runtime = "nodejs";

type RefImage = {
  image: string;
  mimeType?: string;
  role?: string;
  focus?: ImagePromptFocus;
};

function normalizeFocus(value: unknown): ImagePromptFocus {
  if (value === "subject" || value === "background" || value === "style" || value === "full") {
    return value;
  }
  return "full";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      images?: RefImage[];
      model?: string;
      detail?: string;
      extraHints?: string;
    };

    const images = body.images?.filter((entry) => entry.image?.trim()) ?? [];
    if (images.length === 0) {
      return apiError("At least one image is required.", 400);
    }
    if (images.length > 4) {
      return apiError("At most 4 reference images are supported.", 400);
    }

    const model = normalizeComfyModel(body.model);
    const detail = normalizeDetailLevel(body.detail);
    const parts: string[] = [];

    for (const [index, ref] of images.entries()) {
      const role = ref.role?.trim() || `reference ${index + 1}`;
      const result = await generateImagePrompt({
        model,
        detail,
        imageDataUrl: ref.image.trim(),
        mimeType: ref.mimeType,
        focus: normalizeFocus(ref.focus),
        extraHints: `Reference role: ${role}. ${body.extraHints?.trim() || ""}`.trim(),
      });
      parts.push(`[${role}] ${result.prompt}`);
    }

    const prompt = parts.join("\n\n");
    return apiJson({ prompt, parts, model, detail });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Multi-ref prompt failed.", 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/image-prompt/multi");
}
