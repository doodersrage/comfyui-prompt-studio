import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installComfyUiMissingNodePacks } from "./comfyui-manager-install";

type Route = {
  match: (url: string, method: string) => boolean;
  respond: () => { ok: boolean; status?: number; json?: () => Promise<unknown> };
};

function makeFetchImpl(routes: Route[]) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    for (const route of routes) {
      if (route.match(url, method)) {
        const result = route.respond();
        return {
          ok: result.ok,
          status: result.status ?? (result.ok ? 200 : 404),
          json: result.json ?? (async () => null),
        } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => null } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const IDLE_QUEUE_STATUS = { is_processing: false, total_count: 1, done_count: 1 };

describe("installComfyUiMissingNodePacks", () => {
  it("returns ok immediately for an empty/blank class type list, without any request", async () => {
    const { fetchImpl, calls } = makeFetchImpl([]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["  ", ""],
      fetchImpl,
    });
    assert.deepEqual(result, { ok: true, installed: [], unresolved: [], restartNeeded: false });
    assert.equal(calls.length, 0);
  });

  it("reports ComfyUI-Manager as missing when both mappings and list requests fail", async () => {
    const { fetchImpl } = makeFetchImpl([]); // every request 404s
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.equal(result.missingManager, true);
    assert.match(result.error ?? "", /ComfyUI-Manager is not available/);
  });

  it("reports unresolved class types when no Manager pack maps to them", async () => {
    const { fetchImpl } = makeFetchImpl([
      {
        match: url => url.includes("/getmappings"),
        respond: () => ({ ok: true, json: async () => ({}) }),
      },
      {
        match: url => url.includes("/getlist"),
        respond: () => ({ ok: true, json: async () => ({ custom_nodes: [] }) }),
      },
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["TotallyUnknownNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.unresolved, ["TotallyUnknownNode"]);
    assert.match(result.error ?? "", /No Manager pack found for: TotallyUnknownNode/);
  });

  it("installs a resolved pack via the queue/install endpoint and waits for the queue to idle", async () => {
    const { fetchImpl, calls } = makeFetchImpl([
      {
        match: url => url.includes("/getmappings"),
        respond: () => ({ ok: true, json: async () => ({ "pack-a": ["MyCustomNode"] }) }),
      },
      {
        match: url => url.includes("/getlist"),
        respond: () => ({
          ok: true,
          json: async () => ({
            custom_nodes: [
              { name: "pack-a", title: "Pack A", files: ["https://example.com/pack-a"], install_type: "git-clone" },
            ],
          }),
        }),
      },
      {
        match: (url, method) => url.includes("/queue/install") && method === "POST",
        respond: () => ({ ok: true }),
      },
      {
        match: (url, method) => url.includes("/queue/start") && method === "POST",
        respond: () => ({ ok: true }),
      },
      {
        match: url => url.includes("/queue/status"),
        respond: () => ({ ok: true, json: async () => IDLE_QUEUE_STATUS }),
      },
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host/",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.installed, ["Pack A"]);
    assert.equal(result.restartNeeded, true);
    assert.ok(calls.some(c => c.url === "http://host/api/manager/queue/install" && c.method === "POST"));
  });

  it("falls back to the direct /customnode/install endpoint when queue/install is refused", async () => {
    const { fetchImpl } = makeFetchImpl([
      {
        match: url => url.includes("/getmappings"),
        respond: () => ({ ok: true, json: async () => ({ "pack-a": ["MyCustomNode"] }) }),
      },
      {
        match: url => url.includes("/getlist"),
        respond: () => ({
          ok: true,
          json: async () => ({
            custom_nodes: [{ name: "pack-a", files: ["https://example.com/pack-a"], install_type: "git-clone" }],
          }),
        }),
      },
      { match: url => url.includes("/queue/install"), respond: () => ({ ok: false, status: 403 }) },
      { match: url => url.includes("/customnode/install"), respond: () => ({ ok: true }) },
      { match: (url, method) => url.includes("/queue/start") && method === "POST", respond: () => ({ ok: true }) },
      { match: url => url.includes("/queue/status"), respond: () => ({ ok: true, json: async () => IDLE_QUEUE_STATUS }) },
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.installed, ["pack-a"]);
  });

  it("reports a refused-install failure when every install endpoint fails for every pack", async () => {
    const { fetchImpl } = makeFetchImpl([
      {
        match: url => url.includes("/getmappings"),
        respond: () => ({ ok: true, json: async () => ({ "pack-a": ["MyCustomNode"] }) }),
      },
      {
        match: url => url.includes("/getlist"),
        respond: () => ({
          ok: true,
          json: async () => ({
            custom_nodes: [{ name: "pack-a", files: ["https://example.com/pack-a"], install_type: "git-clone" }],
          }),
        }),
      },
      // every install endpoint 404s (default fallback)
    ]);
    const result = await installComfyUiMissingNodePacks({
      baseUrl: "http://host",
      classTypes: ["MyCustomNode"],
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /ComfyUI-Manager refused the install queue/);
  });
});
