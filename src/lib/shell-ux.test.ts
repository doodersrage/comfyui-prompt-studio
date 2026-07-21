import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage.ts";
import { loadRecentDestinations, pushRecentDestination } from "./recent-destinations.ts";
import { isStudioTabId, studioTabHref, STUDIO_TABS } from "./studio-nav.ts";
import { loadUiDensity, saveUiDensity } from "./density-settings.ts";
import {
  dismissAppToast,
  getAppToasts,
  pushAppToast,
  rememberToastPreference,
  toastQueueOutcome,
} from "./app-toast.ts";
import { loadToolContext, saveToolContext } from "./tool-context-memory.ts";
import { resetUiChrome } from "./reset-ui-chrome.ts";
import { loadNavFavorites } from "./nav-favorites.ts";
import { loadLastToolRoute, saveLastToolRoute } from "./last-tool-route.ts";

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      dispatchEvent: () => true,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { dataset },
    },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
    if (originalDocument === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
}

describe("recent destinations", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("keeps the five most recent unique hrefs", () => {
    withMockLocalStorage(() => {
      for (let i = 0; i < 7; i += 1) {
        pushRecentDestination({ href: `/p${i}`, label: `Page ${i}` });
      }
      pushRecentDestination({ href: "/p3", label: "Page 3 again" });
      const recent = loadRecentDestinations();
      assert.equal(recent.length, 5);
      assert.equal(recent[0]?.href, "/p3");
      assert.equal(recent[0]?.label, "Page 3 again");
    });
  });
});

describe("studio nav", () => {
  it("validates tabs and builds hrefs", () => {
    assert.equal(isStudioTabId("history"), true);
    assert.equal(isStudioTabId("nope"), false);
    assert.equal(studioTabHref("history"), "/studio");
    assert.equal(studioTabHref("analytics"), "/studio?tab=analytics");
    assert.ok(STUDIO_TABS.length >= 10);
  });
});

describe("ui density", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("persists compact density", () => {
    withMockLocalStorage(() => {
      assert.equal(loadUiDensity(), "comfortable");
      saveUiDensity("compact");
      assert.equal(loadUiDensity(), "compact");
      assert.equal(document.documentElement.dataset.density, "compact");
    });
  });
});

describe("app toast", () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      rememberToastPreference(true);
      while (getAppToasts().length) {
        dismissAppToast(getAppToasts()[0]!.id);
      }
    });
  });

  it("queues and dismisses toasts", () => {
    withMockLocalStorage(() => {
      rememberToastPreference(true);
      const id = pushAppToast({ text: "Queued", tone: "info", ttlMs: 0 });
      assert.ok(id);
      assert.equal(getAppToasts()[0]?.text, "Queued");
      dismissAppToast(id!);
      assert.equal(getAppToasts().length, 0);
    });
  });

  it("toastQueueOutcome uses danger for failures", () => {
    withMockLocalStorage(() => {
      rememberToastPreference(true);
      while (getAppToasts().length) {
        dismissAppToast(getAppToasts()[0]!.id);
      }
      toastQueueOutcome({ ok: false, text: "ComfyUI queue failed." });
      assert.equal(getAppToasts()[0]?.tone, "danger");
    });
  });
});

describe("tool context memory", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("stores per-tool model and workflow", () => {
    withMockLocalStorage(() => {
      saveToolContext("generate", {
        model: "qwen-image-2512",
        selectedWorkflowFileId: "wf-1",
      });
      assert.deepEqual(loadToolContext("generate"), {
        model: "qwen-image-2512",
        selectedWorkflowFileId: "wf-1",
      });
      assert.equal(loadToolContext("character"), undefined);
    });
  });
});

describe("last tool route", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("remembers allowed routes and rejects login", () => {
    withMockLocalStorage(() => {
      saveLastToolRoute("/gallery");
      assert.equal(loadLastToolRoute(), "/gallery");
      saveLastToolRoute("/login");
      assert.equal(loadLastToolRoute(), "/gallery");
    });
  });
});

describe("mute toasts", () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      rememberToastPreference(true);
      while (getAppToasts().length) {
        dismissAppToast(getAppToasts()[0]!.id);
      }
    });
  });

  it("skips push when toasts are disabled", () => {
    withMockLocalStorage(() => {
      rememberToastPreference(false);
      assert.equal(pushAppToast({ text: "Should not show", ttlMs: 0 }), null);
      assert.equal(getAppToasts().length, 0);
      rememberToastPreference(true);
      assert.ok(pushAppToast({ text: "Visible", ttlMs: 0 }));
    });
  });
});

describe("reset ui chrome", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("clears favorites and resets density", () => {
    withMockLocalStorage(() => {
      saveToolContext("generate", { model: "qwen-image-2512" });
      saveUiDensity("compact");
      resetUiChrome();
      assert.deepEqual(loadNavFavorites(), []);
      assert.equal(loadUiDensity(), "comfortable");
      assert.equal(loadToolContext("generate"), undefined);
    });
  });
});
