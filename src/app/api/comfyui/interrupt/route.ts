import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid ComfyUI URL.", 400);
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/interrupt`, {
      method: "POST",
    });
    if (!response.ok) {
      return apiError(`ComfyUI interrupt failed: HTTP ${response.status}`, 502);
    }
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "ComfyUI interrupt failed.", 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/comfyui/interrupt");
}
