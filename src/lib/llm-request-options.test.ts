import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  llmRunnerOptions,
  parseLlmRequestOptions,
  resolveRequestLlmEnabled,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
  resolveRequestTemperature,
  resolveRequestVisionModel,
  sharedLlmRequestBody,
} from "./llm-request-options.ts";

describe("llm-request-options", () => {
  const originalLlmEnabled = process.env.LLM_ENABLED;
  const originalAllowFallback = process.env.ALLOW_TEMPLATE_FALLBACK;

  afterEach(() => {
    if (originalLlmEnabled === undefined) {
      delete process.env.LLM_ENABLED;
    } else {
      process.env.LLM_ENABLED = originalLlmEnabled;
    }
    if (originalAllowFallback === undefined) {
      delete process.env.ALLOW_TEMPLATE_FALLBACK;
    } else {
      process.env.ALLOW_TEMPLATE_FALLBACK = originalAllowFallback;
    }
  });

  it("parses temperature, fallback, model, vision model, and enabled from body", () => {
    const options = parseLlmRequestOptions({
      llmTemperature: 1.2,
      allowTemplateFallback: false,
      llmModel: "  qwen3:latest  ",
      llmVisionModel: " qwen3-vl:latest ",
      llmEnabled: false,
    });

    assert.equal(options.temperature, 1.2);
    assert.equal(options.allowTemplateFallback, false);
    assert.equal(options.llmModel, "qwen3:latest");
    assert.equal(options.llmVisionModel, "qwen3-vl:latest");
    assert.equal(options.llmEnabled, false);
  });

  it("ignores out-of-range temperature and blank model overrides", () => {
    const options = parseLlmRequestOptions({
      llmTemperature: 9,
      llmModel: "   ",
      llmVisionModel: "",
    });

    assert.equal(options.temperature, undefined);
    assert.equal(options.llmModel, undefined);
    assert.equal(options.llmVisionModel, undefined);
  });

  it("returns defaults for a missing/null body", () => {
    assert.deepEqual(parseLlmRequestOptions(), {
      temperature: undefined,
      allowTemplateFallback: undefined,
      llmModel: undefined,
      llmVisionModel: undefined,
      llmEnabled: undefined,
    });
    assert.deepEqual(parseLlmRequestOptions(null), {
      temperature: undefined,
      allowTemplateFallback: undefined,
      llmModel: undefined,
      llmVisionModel: undefined,
      llmEnabled: undefined,
    });
  });

  it("resolveRequestTemperature falls back to server default", () => {
    process.env.LLM_TEMPERATURE = "0.5";
    assert.equal(resolveRequestTemperature(), 0.5);
    assert.equal(resolveRequestTemperature({ temperature: 1.8 }), 1.8);
    delete process.env.LLM_TEMPERATURE;
  });

  it("resolveRequestTemplateFallback honors explicit override then server default", () => {
    process.env.ALLOW_TEMPLATE_FALLBACK = "false";
    assert.equal(resolveRequestTemplateFallback(), false);
    assert.equal(resolveRequestTemplateFallback({ allowTemplateFallback: true }), true);
    assert.equal(resolveRequestTemplateFallback({ allowTemplateFallback: false }), false);
  });

  it("resolveRequestLlmEnabled short-circuits template mode on explicit false", () => {
    process.env.LLM_ENABLED = "true";
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: false }), false);
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: true }), true);
    assert.equal(resolveRequestLlmEnabled(), true);
    assert.equal(resolveRequestLlmEnabled(undefined), true);

    process.env.LLM_ENABLED = "false";
    assert.equal(resolveRequestLlmEnabled(), false);
    // Explicit true override cannot force-enable when the server has it disabled —
    // enabling still requires the server LLM_ENABLED flag.
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: true }), false);
  });

  it("resolveRequestLlmModel / resolveRequestVisionModel trim and drop blanks", () => {
    assert.equal(resolveRequestLlmModel({ llmModel: "  llama3  " }), "llama3");
    assert.equal(resolveRequestLlmModel({ llmModel: "   " }), undefined);
    assert.equal(resolveRequestLlmModel(), undefined);
    assert.equal(
      resolveRequestVisionModel({ llmVisionModel: " qwen3-vl:latest " }),
      "qwen3-vl:latest",
    );
    assert.equal(resolveRequestVisionModel({ llmVisionModel: "" }), undefined);
  });

  it("llmRunnerOptions passes through all fields, empty object when undefined", () => {
    assert.deepEqual(llmRunnerOptions(undefined), {});
    assert.deepEqual(
      llmRunnerOptions({
        temperature: 0.9,
        allowTemplateFallback: true,
        llmModel: "model-a",
        llmVisionModel: "vision-a",
        llmEnabled: false,
      }),
      {
        temperature: 0.9,
        allowTemplateFallback: true,
        llmModel: "model-a",
        llmVisionModel: "vision-a",
        llmEnabled: false,
      },
    );
  });

  it("sharedLlmRequestBody only includes set session overrides", () => {
    assert.deepEqual(
      sharedLlmRequestBody({
        sessionLlmTemperature: undefined,
        sessionAllowTemplateFallback: undefined,
        sessionLlmModel: undefined,
        sessionLlmVisionModel: undefined,
        sessionLlmEnabled: undefined,
      }),
      {},
    );

    assert.deepEqual(
      sharedLlmRequestBody({
        sessionLlmTemperature: 1.1,
        sessionAllowTemplateFallback: false,
        sessionLlmModel: "  llama3  ",
        sessionLlmVisionModel: " qwen3-vl:latest ",
        sessionLlmEnabled: false,
      }),
      {
        llmTemperature: 1.1,
        allowTemplateFallback: false,
        llmModel: "llama3",
        llmVisionModel: "qwen3-vl:latest",
        llmEnabled: false,
      },
    );
  });
});
