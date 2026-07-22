"use client";

import { useEffect, useState } from "react";
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

const EMPTY_FORM = {
  id: "",
  label: "",
  description: "",
  href: "",
  category: "plugin" as ToolPlugin["category"],
};

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<ToolPlugin[]>(BUILTIN_TOOL_PLUGINS);
  const [customJson, setCustomJson] = useState("[]");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const loaded = loadToolPlugins();
      setPlugins(loaded);
      const custom = loaded.filter(
        (plugin) => !BUILTIN_TOOL_PLUGINS.some((builtIn) => builtIn.id === plugin.id),
      );
      setCustomJson(JSON.stringify(custom, null, 2));
    });
  }, []);

  function refreshFromStorage() {
    const loaded = loadToolPlugins();
    setPlugins(loaded);
    const custom = loaded.filter(
      (plugin) => !BUILTIN_TOOL_PLUGINS.some((builtIn) => builtIn.id === plugin.id),
    );
    setCustomJson(JSON.stringify(custom, null, 2));
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

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Tools</ToolBadge>}
      title="Plugins"
      description="Nav bookmarks for built-in tools plus custom localStorage entries. This is not a runnable plugin runtime — entries are hrefs opened in the app shell."
    >
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
          Advanced: edit the full custom array. Each item needs id, label, description, href, and
          category. See <code className="text-violet-300">examples/custom-plugin.example.json</code>.
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
