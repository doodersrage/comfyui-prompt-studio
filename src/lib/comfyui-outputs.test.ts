import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComfyViewPath,
  buildComfyViewSrcSet,
  extractImagesFromOutputs,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_SRCSET_WIDTHS,
  GALLERY_THUMB_WIDTH,
  resolveComfyOutputMediaKind,
} from "./comfyui-outputs.ts";

describe("comfyui outputs view paths", () => {
  const image = {
    filename: "out.png",
    subfolder: "PromptStudio",
    type: "output",
  };

  it("builds full and width-capped view paths", () => {
    const full = buildComfyViewPath("http://127.0.0.1:8188", image);
    assert.match(full, /\/api\/comfyui\/view\?/);
    assert.doesNotMatch(full, /[?&]w=/);

    const thumb = buildComfyViewPath("http://127.0.0.1:8188/", image, {
      width: GALLERY_THUMB_WIDTH,
    });
    assert.match(thumb, new RegExp(`[?&]w=${GALLERY_THUMB_WIDTH}\\b`));

    const strip = buildComfyViewPath("http://127.0.0.1:8188", image, {
      width: GALLERY_STRIP_THUMB_WIDTH,
    });
    assert.match(strip, new RegExp(`[?&]w=${GALLERY_STRIP_THUMB_WIDTH}\\b`));
  });

  it("builds responsive srcSet entries", () => {
    const srcSet = buildComfyViewSrcSet("http://127.0.0.1:8188", image);
    for (const width of GALLERY_THUMB_SRCSET_WIDTHS) {
      assert.match(srcSet, new RegExp(`w=${width} ${width}w`));
    }
  });
});

describe("comfyui output media kind resolution", () => {
  it("treats plain photo formats as images", () => {
    assert.equal(resolveComfyOutputMediaKind({ filename: "out.png" }), "image");
    assert.equal(resolveComfyOutputMediaKind({ filename: "out.jpg" }), "image");
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/png" }),
      "image",
    );
  });

  it("treats mp4/webm and format-tagged gif/webp as video for gallery rendering", () => {
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.mp4" }), "video");
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.webm" }), "video");
    // Bare .gif/.webp are ambiguous (still vs animated) — prefer image unless
    // Comfy tagged image/gif|webp or video/* (see resolveComfyOutputMediaKind).
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.gif" }), "image");
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.webp" }), "image");
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "video/h264-mp4" }),
      "video",
    );
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/gif" }),
      "video",
    );
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/webp" }),
      "video",
    );
  });

  it("prefers the explicit format hint over the file extension", () => {
    // ComfyUI sometimes emits a generic filename with the real kind only in `format`.
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "ComfyUI_00001_.png", format: "video/webp" }),
      "video",
    );
  });

  it("extracts refs from both the images and gifs output keys", () => {
    const images = extractImagesFromOutputs({
      "6": {
        images: [{ filename: "frame.png", subfolder: "PromptStudio", type: "output" }],
      },
      "7": {
        gifs: [
          {
            filename: "clip.webp",
            subfolder: "PromptStudio",
            type: "output",
            format: "image/webp",
          },
        ],
      },
    });

    assert.equal(images.length, 2);
    assert.equal(images[0]?.filename, "frame.png");
    assert.equal(images[1]?.filename, "clip.webp");
    assert.equal(images[1]?.format, "image/webp");
    assert.equal(resolveComfyOutputMediaKind(images[1]!), "video");
  });
});
