import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideOomRetry,
  downgradeQueueQualityProfile,
  isOomOrExecutionErrorMessage,
  pickAlternateComfyUrl,
} from "./oom-retry.ts";

describe("isOomOrExecutionErrorMessage", () => {
  it("detects common CUDA/OOM phrasing", () => {
    assert.equal(
      isOomOrExecutionErrorMessage(
        "torch.cuda.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB",
      ),
      true,
    );
    assert.equal(isOomOrExecutionErrorMessage("Out of Memory"), true);
    assert.equal(isOomOrExecutionErrorMessage("ran out of memory on device"), true);
  });

  it("detects execution_error status text", () => {
    assert.equal(
      isOomOrExecutionErrorMessage("KSampler #12: execution_error - RuntimeError"),
      true,
    );
  });

  it("returns false for unrelated failures", () => {
    assert.equal(isOomOrExecutionErrorMessage("Connection refused"), false);
    assert.equal(isOomOrExecutionErrorMessage("Invalid workflow JSON"), false);
  });

  it("returns false for empty/undefined/null messages", () => {
    assert.equal(isOomOrExecutionErrorMessage(""), false);
    assert.equal(isOomOrExecutionErrorMessage(undefined), false);
    assert.equal(isOomOrExecutionErrorMessage(null), false);
  });
});

describe("downgradeQueueQualityProfile", () => {
  it("downgrades max to final and final to draft", () => {
    assert.equal(downgradeQueueQualityProfile("max"), "final");
    assert.equal(downgradeQueueQualityProfile("final"), "draft");
  });

  it("returns null when there is no lower tier", () => {
    assert.equal(downgradeQueueQualityProfile("draft"), null);
    assert.equal(downgradeQueueQualityProfile("followSettings"), null);
    assert.equal(downgradeQueueQualityProfile(undefined), null);
  });
});

describe("pickAlternateComfyUrl", () => {
  const pool = ["http://10.0.0.5:8188", "http://10.0.0.6:8188"];

  it("picks a different endpoint than the current one", () => {
    assert.equal(pickAlternateComfyUrl(pool, "http://10.0.0.5:8188"), "http://10.0.0.6:8188");
  });

  it("matches the current URL regardless of trailing slash/case", () => {
    assert.equal(pickAlternateComfyUrl(pool, "HTTP://10.0.0.5:8188/"), "http://10.0.0.6:8188");
  });

  it("returns undefined with fewer than two pool URLs", () => {
    assert.equal(pickAlternateComfyUrl(["http://a"], "http://a"), undefined);
    assert.equal(pickAlternateComfyUrl(undefined, "http://a"), undefined);
    assert.equal(pickAlternateComfyUrl([], "http://a"), undefined);
  });

  it("returns undefined when every pool URL matches current (single real endpoint)", () => {
    assert.equal(
      pickAlternateComfyUrl(["http://a", "http://a/"], "http://a"),
      undefined,
    );
  });
});

describe("decideOomRetry", () => {
  it("does nothing when auto-retry is disabled", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
      autoRetryOnOom: false,
    });
    assert.equal(decision.action, "none");
  });

  it("does nothing when already retried once", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
      alreadyRetried: true,
    });
    assert.equal(decision.action, "none");
  });

  it("does nothing when the failure is not OOM/execution_error", () => {
    const decision = decideOomRetry({
      statusMessage: "Connection refused",
      queueQualityProfile: "max",
    });
    assert.equal(decision.action, "none");
  });

  it("downgrades a Max job to Final on the same host with no pool", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
    });
    assert.equal(decision.action, "downgrade");
    if (decision.action === "downgrade") {
      assert.equal(decision.nextProfile, "final");
    }
  });

  it("downgrades a Final job to Draft on the same host", () => {
    const decision = decideOomRetry({
      statusMessage: "execution_error",
      queueQualityProfile: "final",
    });
    assert.equal(decision.action, "downgrade");
    if (decision.action === "downgrade") {
      assert.equal(decision.nextProfile, "draft");
    }
  });

  it("downgrades and switches endpoint when a pool exists and downgrade is enabled", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
      poolUrls: ["http://10.0.0.5:8188", "http://10.0.0.6:8188"],
      currentComfyUrl: "http://10.0.0.5:8188",
    });
    assert.equal(decision.action, "downgrade-and-switch");
    if (decision.action === "downgrade-and-switch") {
      assert.equal(decision.nextProfile, "final");
      assert.equal(decision.nextComfyUrl, "http://10.0.0.6:8188");
    }
  });

  it("only switches endpoint (no downgrade) when downgrade is disabled but a pool exists", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
      downgradeEnabled: false,
      poolUrls: ["http://10.0.0.5:8188", "http://10.0.0.6:8188"],
      currentComfyUrl: "http://10.0.0.5:8188",
    });
    assert.equal(decision.action, "switch-endpoint");
    if (decision.action === "switch-endpoint") {
      assert.equal(decision.nextComfyUrl, "http://10.0.0.6:8188");
    }
  });

  it("does nothing for a Max job with downgrade disabled and no pool", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "max",
      downgradeEnabled: false,
    });
    assert.equal(decision.action, "none");
  });

  it("switches endpoint for a Draft job when a pool exists (no downgrade tier)", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "draft",
      poolUrls: ["http://10.0.0.5:8188", "http://10.0.0.6:8188"],
      currentComfyUrl: "http://10.0.0.5:8188",
    });
    assert.equal(decision.action, "switch-endpoint");
    if (decision.action === "switch-endpoint") {
      assert.equal(decision.nextComfyUrl, "http://10.0.0.6:8188");
    }
  });

  it("does nothing for a Draft job with no pool", () => {
    const decision = decideOomRetry({
      statusMessage: "CUDA out of memory",
      queueQualityProfile: "draft",
    });
    assert.equal(decision.action, "none");
  });
});
