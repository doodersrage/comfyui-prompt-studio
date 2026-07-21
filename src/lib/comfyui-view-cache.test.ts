import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  buildViewCacheKey,
  contentTypeForViewFormat,
  negotiateViewFormat,
  readViewCache,
  writeViewCache,
} from "./comfyui-view-cache.ts";

describe("comfyui view cache", () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = "";

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-cache-"));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  after(() => {
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("negotiates format from Accept", () => {
    assert.equal(negotiateViewFormat("image/avif,image/webp,*/*"), "avif");
    assert.equal(negotiateViewFormat("image/webp,*/*"), "webp");
    assert.equal(negotiateViewFormat("image/png,*/*"), "jpeg");
    assert.equal(contentTypeForViewFormat("webp"), "image/webp");
  });

  it("round-trips memory and disk cache entries", () => {
    const key = buildViewCacheKey({
      comfyUrl: "http://127.0.0.1:8188",
      filename: "a.png",
      subfolder: "",
      type: "output",
      width: 512,
      format: "webp",
    });
    const payload = {
      buffer: Buffer.from("thumb-bytes"),
      contentType: "image/webp",
    };
    writeViewCache(key, "webp", payload);
    const hit = readViewCache(key, "webp");
    assert.ok(hit);
    assert.equal(hit.contentType, "image/webp");
    assert.equal(hit.buffer.toString("utf8"), "thumb-bytes");
  });
});
