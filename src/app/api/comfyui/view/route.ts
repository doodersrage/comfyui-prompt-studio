import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";
import { apiError, apiMethodNotAllowed } from "@/lib/api/response";
import {
  buildViewCacheKey,
  contentTypeForViewFormat,
  negotiateViewFormat,
  readViewCache,
  writeViewCache,
  type ViewCacheFormat,
} from "@/lib/comfyui-view-cache";
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from "@/lib/url-safety";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseThumbWidth(raw: string | null): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(Math.floor(value), 2048);
}

async function encodeThumb(
  buffer: Buffer,
  thumbWidth: number,
  format: ViewCacheFormat,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: thumbWidth,
      height: thumbWidth,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (format === "avif") {
    return pipeline.avif({ quality: 52 }).toBuffer();
  }
  if (format === "webp") {
    return pipeline.webp({ quality: 72 }).toBuffer();
  }
  return pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let filename: string;
  let subfolder: string;
  let type: "output" | "input" | "temp";
  try {
    filename = sanitizeComfyViewFilename(searchParams.get("filename") ?? "");
    subfolder = sanitizeComfyViewSubfolder(searchParams.get("subfolder") ?? "");
    type = normalizeComfyViewType(searchParams.get("type")?.trim() || "output");
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid view parameters.",
      400,
    );
  }

  const thumbWidth = parseThumbWidth(searchParams.get("w"));

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get("comfyUrl") ?? undefined,
  });

  let comfyUrl: string;
  try {
    comfyUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid ComfyUI URL.",
      400,
    );
  }

  const format = negotiateViewFormat(request.headers.get("accept"));

  // Range requests (video seeking/scrubbing) bypass the thumbnail cache and
  // are proxied straight through so the browser can stream/seek video.
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const rangeViewUrl = new URL(`${comfyUrl}/view`);
    rangeViewUrl.searchParams.set("filename", filename);
    rangeViewUrl.searchParams.set("subfolder", subfolder);
    rangeViewUrl.searchParams.set("type", type);

    try {
      const rangeResponse = await fetch(rangeViewUrl.toString(), {
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
        headers: { range: rangeHeader },
      });

      if (!rangeResponse.ok && rangeResponse.status !== 206) {
        return apiError(`ComfyUI view returned HTTP ${rangeResponse.status}`, 502);
      }

      const rangeBuffer = Buffer.from(await rangeResponse.arrayBuffer());
      const passthroughHeaders: Record<string, string> = {
        "Content-Type": rangeResponse.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Accept-Ranges": "bytes",
      };
      const contentRange = rangeResponse.headers.get("content-range");
      if (contentRange) {
        passthroughHeaders["Content-Range"] = contentRange;
      }

      return new NextResponse(new Uint8Array(rangeBuffer), {
        status: rangeResponse.status,
        headers: passthroughHeaders,
      });
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : "Failed to fetch ComfyUI video",
        502,
      );
    }
  }

  if (thumbWidth) {
    const cacheKey = buildViewCacheKey({
      comfyUrl,
      filename,
      subfolder,
      type,
      width: thumbWidth,
      format,
    });
    const cached = readViewCache(cacheKey, format);
    if (cached) {
      return new NextResponse(new Uint8Array(cached.buffer), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "X-Image-Variant": "thumb",
          "X-Image-Cache": "hit",
        },
      });
    }
  }

  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set("filename", filename);
  viewUrl.searchParams.set("subfolder", subfolder);
  viewUrl.searchParams.set("type", type);

  try {
    const response = await fetch(viewUrl.toString(), {
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    if (!response.ok) {
      return apiError(`ComfyUI view returned HTTP ${response.status}`, 502);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const isVideo = contentType.startsWith("video/");
    if (!contentType.startsWith("image/") && !isVideo) {
      return apiError("ComfyUI view did not return an image.", 502);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Videos can't be resized by sharp; always return the original bytes.
    if (thumbWidth && !isVideo) {
      try {
        const resized = await encodeThumb(buffer, thumbWidth, format);
        const encodedType = contentTypeForViewFormat(format);
        const cacheKey = buildViewCacheKey({
          comfyUrl,
          filename,
          subfolder,
          type,
          width: thumbWidth,
          format,
        });
        writeViewCache(cacheKey, format, {
          buffer: resized,
          contentType: encodedType,
        });

        return new NextResponse(new Uint8Array(resized), {
          status: 200,
          headers: {
            "Content-Type": encodedType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Image-Variant": "thumb",
            "X-Image-Cache": "miss",
          },
        });
      } catch {
        // Fall through to original bytes if resize fails.
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ...(isVideo ? { "Accept-Ranges": "bytes" } : {}),
      },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to fetch ComfyUI image",
      502,
    );
  }
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/comfyui/view");
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
