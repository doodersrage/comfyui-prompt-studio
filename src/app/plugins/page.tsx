"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolSection } from "@/components/ui/ToolPageShell";
import {
  BUILTIN_TOOL_PLUGINS,
  loadToolPlugins,
  saveCustomToolPlugins,
  type ToolPlugin,
} from "@/lib/tool-plugin-registry";

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<ToolPlugin[]>(BUILTIN_TOOL_PLUGINS);
  const [customJson, setCustomJson] = useState("[]");

  useEffect(() => {
    setPlugins(loadToolPlugins());
  }, []);

  function saveCustom() {
    try {
      const parsed = JSON.parse(customJson) as ToolPlugin[];
      saveCustomToolPlugins(parsed);
      setPlugins(loadToolPlugins());
    } catch {
      window.alert("Invalid plugin JSON.");
    }
  }

  return (
    <PageCanvas accent="violet">
      <ToolSection title="Tool plugins">
        <p className="text-sm text-zinc-400">
          Built-in and custom tool entries for extending the prompt studio navigation.
        </p>
        <ul className="mt-4 space-y-3">
          {plugins.map((plugin) => (
            <li
              key={plugin.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-100">{plugin.label}</p>
                  <p className="mt-1 text-sm text-zinc-400">{plugin.description}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                    {plugin.category}
                  </p>
                </div>
                <Link
                  href={plugin.href}
                  className="rounded-lg border border-violet-700/60 px-3 py-1.5 text-sm text-violet-200 transition hover:border-violet-500 hover:bg-violet-500/10"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Custom plugins (localStorage)">
        <p className="text-sm text-zinc-400">
          Append custom entries as JSON array. Each item needs id, label, description, href, and
          category.
        </p>
        <textarea
          value={customJson}
          onChange={(event) => setCustomJson(event.target.value)}
          rows={8}
          spellCheck={false}
          className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-emerald-200"
        />
        <button
          type="button"
          onClick={saveCustom}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Save custom plugins
        </button>
      </ToolSection>
    </PageCanvas>
  );
}
