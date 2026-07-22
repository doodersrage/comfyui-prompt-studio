import { subscribeComfyLiveBridge } from "@/lib/comfyui-live-bridge";
import { apiError, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Long-running generations keep this stream open. */
export const maxDuration = 600;

/**
 * Same-origin NDJSON stream of ComfyUI progress + latent preview frames.
 * The server holds the Comfy WebSocket so the browser never needs direct
 * access to the Comfy host (critical for Docker / private networks).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim();
  if (!clientId) {
    return apiError("clientId query parameter is required.", 400);
  }

  const comfyUrlHint = searchParams.get("comfyUrl")?.trim() || undefined;
  const encoder = new TextEncoder();

  let closeBridge: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (payload: unknown) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // stream already closed
        }
      };

      try {
        const subscription = subscribeComfyLiveBridge({
          clientId,
          comfyUrl: comfyUrlHint,
          onEvent: (event) => {
            write(event);
          },
        });
        closeBridge = subscription.close;
      } catch (error) {
        write({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to open ComfyUI live bridge.",
        });
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }

      const onAbort = () => {
        if (closed) {
          return;
        }
        closed = true;
        closeBridge?.();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      request.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
      closeBridge?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/comfyui/live");
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
