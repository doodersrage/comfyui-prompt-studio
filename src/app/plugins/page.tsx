"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FieldLabel, MonoTextArea, SelectInput, TextInput } from "@/components/ui/Field";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import {
  BUILTIN_TOOL_PLUGINS,
  loadToolPlugins,
  saveCustomToolPlugins,
  type ToolPlugin,
} from "@/lib/tool-plugin-registry";
import {
  loadPluginQueueHooks,
  savePluginQueueHooks,
  type PluginQueueHook,
} from "@/lib/plugin-queue-hooks";
import {
  loadInstalledPlugins,
  normalizePluginManifest,
  removeInstalledPlugin,
  setInstalledPluginEnabled,
  upsertInstalledPlugin,
  type PluginManifest,
} from "@/lib/plugin-manifest";
import queueRewriteExample from "../../../examples/queue-rewrite-plugin.json";

const EMPTY_FORM = {
  id: "",
  label: "",
  description: "",
  href: "",
  category: "plugin" as ToolPlugin["category"],
};

const EMPTY_HOOK = {
  id: "",
  label: "",
  url: "",
};

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<ToolPlugin[]>(BUILTIN_TOOL_PLUGINS);
  const [customJson, setCustomJson] = useState("[]");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<PluginQueueHook[]>([]);
  const [hookForm, setHookForm] = useState(EMPTY_HOOK);
  const [hookError, setHookError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<PluginManifest[]>([]);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestStatus, setManifestStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refreshFromStorage();
    });
  }, []);

  function refreshFromStorage() {
    const loaded = loadToolPlugins();
    setPlugins(loaded);
    const custom = loaded.filter(
      (plugin) => !BUILTIN_TOOL_PLUGINS.some((builtIn) => builtIn.id === plugin.id),
    );
    setCustomJson(JSON.stringify(custom, null, 2));
    setHooks(loadPluginQueueHooks());
    setInstalled(loadInstalledPlugins());
  }

  function saveCustom() {
    try {
      const parsed = JSON.parse(customJson) as ToolPlugin[];
      saveCustomToolPlugins(parsed);
      refreshFromStorage();
      setFormError(null);
    } catch {
      setFormError("Invalid plugin JSON.");
    }
  }

  function addFromForm() {
    const id = form.id.trim().toLowerCase().replace(/\s+/g, "-");
    const label = form.label.trim();
    const href = form.href.trim();
    if (!id || !label || !href) {
      setFormError("id, label, and href are required.");
      return;
    }
    if (!href.startsWith("/")) {
      setFormError("href should be an in-app path starting with /.");
      return;
    }
    const existing = loadToolPlugins().filter(
      (plugin) => !BUILTIN_TOOL_PLUGINS.some((builtIn) => builtIn.id === plugin.id),
    );
    if (existing.some((plugin) => plugin.id === id) || BUILTIN_TOOL_PLUGINS.some((p) => p.id === id)) {
      setFormError("That id is already registered.");
      return;
    }
    const next: ToolPlugin[] = [
      ...existing,
      {
        id,
        label,
        description: form.description.trim() || "Custom plugin bookmark",
        href,
        category: form.category,
        enabled: true,
      },
    ];
    saveCustomToolPlugins(next);
    setForm(EMPTY_FORM);
    setFormError(null);
    refreshFromStorage();
  }

  function addHook() {
    const id = hookForm.id.trim().toLowerCase().replace(/\s+/g, "-");
    const url = hookForm.url.trim();
    if (!id || !url) {
      setHookError("id and url are required.");
      return;
    }
    if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) {
      setHookError("url must be http(s) or a same-origin path.");
      return;
    }
    if (hooks.some((hook) => hook.id === id)) {
      setHookError("That hook id already exists.");
      return;
    }
    const next = [
      ...hooks,
      {
        id,
        label: hookForm.label.trim() || id,
        url,
        enabled: true,
      },
    ];
    savePluginQueueHooks(next);
    setHooks(next);
    setHookForm(EMPTY_HOOK);
    setHookError(null);
  }

  function importManifestText(raw: string) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;
      for (const candidate of candidates) {
        const normalized = normalizePluginManifest(candidate);
        if (!normalized) {
          continue;
        }
        upsertInstalledPlugin(normalized);
        imported += 1;
      }
      if (!imported) {
        setManifestError("No valid plugin manifests found in that JSON.");
        setManifestStatus(null);
        return;
      }
      setManifestError(null);
      setManifestStatus(
        imported === 1
          ? `Installed ${loadInstalledPlugins().at(-1)?.label ?? "plugin"}.`
          : `Installed ${imported} plugins.`,
      );
      refreshFromStorage();
    } catch {
      setManifestError("Invalid JSON — expected a plugin manifest object or array.");
      setManifestStatus(null);
    }
  }

  async function onManifestFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    importManifestText(text);
  }

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Tools</ToolBadge>}
      title="Plugins"
      description="Install runtime manifests, manage queue-preflight hooks, and keep nav bookmarks for custom tools."
    >
      <ToolSection title="Installed plugins">
        <p className="type-caption">
          Import a JSON manifest to register nav entries, queue hooks, and optional iframe tools.
          See <code className="text-violet-300">examples/queue-rewrite-plugin.json</code>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void onManifestFile(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON manifest
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              importManifestText(JSON.stringify(queueRewriteExample));
            }}
          >
            Load denoise example
          </Button>
        </div>
        {manifestError ? (
          <p className="type-caption mt-2 text-rose-300">{manifestError}</p>
        ) : null}
        {manifestStatus ? (
          <p className="type-caption mt-2 text-[var(--text-secondary)]">{manifestStatus}</p>
        ) : null}
        {installed.length === 0 ? (
          <p className="type-caption mt-4 text-zinc-500">No runtime plugins installed yet.</p>
        ) : (
          <ul className="ui-list mt-4">
            {installed.map((plugin) => (
              <li key={plugin.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{plugin.label}</p>
                  <p className="type-caption">
                    v{plugin.version}
                    {plugin.queueHooks?.url ? ` · hook ${plugin.queueHooks.url}` : ""}
                    {plugin.tools?.length ? ` · ${plugin.tools.length} tool(s)` : ""}
                  </p>
                  <p className="type-overline">
                    {plugin.enabled === false ? "disabled" : "enabled"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink
                    href={`/plugins/${plugin.id}`}
                    size="sm"
                    variant="accent-outline"
                  >
                    Open
                  </ButtonLink>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setInstalled(
                        setInstalledPluginEnabled(plugin.id, plugin.enabled === false),
                      );
                      setManifestStatus(
                        plugin.enabled === false
                          ? `Enabled ${plugin.label}.`
                          : `Disabled ${plugin.label}.`,
                      );
                    }}
                  >
                    {plugin.enabled === false ? "Enable" : "Disable"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setInstalled(removeInstalledPlugin(plugin.id));
                      setManifestStatus(`Removed ${plugin.label}.`);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ToolSection>

      <ToolSection title="Queue preflight hooks">
        <p className="type-caption">
          Enabled hooks receive a POST with{" "}
          <code className="text-violet-300">
            {"{ event, prompt, negativePrompt?, model?, tool?, denoise?, cfg? }"}
          </code>
          . Respond with JSON to rewrite{" "}
          <code className="text-violet-300">prompt</code> /{" "}
          <code className="text-violet-300">negativePrompt</code> /{" "}
          <code className="text-violet-300">denoise</code> /{" "}
          <code className="text-violet-300">cfg</code>, or set{" "}
          <code className="text-violet-300">blocked: true</code> with a{" "}
          <code className="text-violet-300">reason</code> to stop the queue.
        </p>
        {hooks.length === 0 ? (
          <p className="type-caption text-zinc-500">No hooks configured yet.</p>
        ) : (
          <ul className="ui-list">
            {hooks.map((hook) => (
              <li key={hook.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{hook.label}</p>
                  <p className="type-caption break-all">{hook.url}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const next = hooks.map((entry) =>
                        entry.id === hook.id
                          ? { ...entry, enabled: entry.enabled === false }
                          : entry,
                      );
                      savePluginQueueHooks(next);
                      setHooks(next);
                    }}
                  >
                    {hook.enabled === false ? "Enable" : "Disable"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const next = hooks.filter((entry) => entry.id !== hook.id);
                      savePluginQueueHooks(next);
                      setHooks(next);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <FieldLabel>Id</FieldLabel>
            <TextInput
              value={hookForm.id}
              onChange={(event) =>
                setHookForm((prev) => ({ ...prev, id: event.target.value }))
              }
              placeholder="rewrite-nsfw"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>Label</FieldLabel>
            <TextInput
              value={hookForm.label}
              onChange={(event) =>
                setHookForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="NSFW filter"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>URL</FieldLabel>
            <TextInput
              value={hookForm.url}
              onChange={(event) =>
                setHookForm((prev) => ({ ...prev, url: event.target.value }))
              }
              placeholder="/api/my-hook or https://…"
            />
          </label>
        </div>
        {hookError ? <p className="type-caption text-rose-300">{hookError}</p> : null}
        <Button type="button" variant="primary" size="sm" className="mt-3" onClick={addHook}>
          Add queue hook
        </Button>
      </ToolSection>

      <ToolSection title="Registered tools">
        <ul className="ui-list">
          {plugins.map((plugin) => (
            <li key={plugin.id} className="ui-list-row items-start">
              <div className="ui-list-primary min-w-0 space-y-1">
                <p className="type-heading">{plugin.label}</p>
                <p className="type-caption">{plugin.description}</p>
                <p className="type-overline">{plugin.category}</p>
              </div>
              <ButtonLink href={plugin.href} size="sm" variant="accent-outline">
                Open
              </ButtonLink>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Add custom bookmark">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <FieldLabel>Id</FieldLabel>
            <TextInput
              value={form.id}
              onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
              placeholder="my-tool"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>Label</FieldLabel>
            <TextInput
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="My tool"
            />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <TextInput
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Short note shown in the list"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>Href</FieldLabel>
            <TextInput
              value={form.href}
              onChange={(event) => setForm((prev) => ({ ...prev, href: event.target.value }))}
              placeholder="/lint"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>Category</FieldLabel>
            <SelectInput
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  category: event.target.value as ToolPlugin["category"],
                }))
              }
            >
              <option value="plugin">plugin</option>
              <option value="prompt">prompt</option>
              <option value="scene">scene</option>
              <option value="tools">tools</option>
              <option value="video">video</option>
            </SelectInput>
          </label>
        </div>
        {formError ? <p className="type-caption text-rose-300">{formError}</p> : null}
        <Button type="button" variant="primary" size="sm" className="mt-3" onClick={addFromForm}>
          Add bookmark
        </Button>
      </ToolSection>

      <ToolSection title="Custom plugins (JSON)">
        <p className="type-caption">
          Advanced: edit the full custom bookmark array. Each item needs id, label, description,
          href, and category. See{" "}
          <code className="text-violet-300">examples/custom-plugin.example.json</code>.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mb-3"
          onClick={() => {
            setCustomJson(
              JSON.stringify(
                [
                  {
                    id: "my-custom-tool",
                    label: "My custom tool",
                    description: "Example plugin entry — change href to your route.",
                    href: "/lint",
                    category: "plugin",
                    enabled: true,
                  },
                ],
                null,
                2,
              ),
            );
          }}
        >
          Load example
        </Button>
        <MonoTextArea
          value={customJson}
          onChange={(event) => setCustomJson(event.target.value)}
          rows={10}
          spellCheck={false}
        />
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={saveCustom}>
          Save JSON
        </Button>
      </ToolSection>
    </ToolLayout>
  );
}
