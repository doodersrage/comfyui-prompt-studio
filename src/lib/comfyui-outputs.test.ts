import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComfyViewPath,
  buildComfyViewSrcSet,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_SRCSET_WIDTHS,
  GALLERY_THUMB_WIDTH,
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
