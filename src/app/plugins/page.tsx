"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoTextArea } from "@/components/ui/Field";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
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
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Tools</ToolBadge>}
      title="Plugins"
      description="Built-in and custom tool entries for extending the prompt studio navigation."
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

      <ToolSection title="Custom plugins (localStorage)">
        <p className="type-caption">
          Append custom entries as JSON array. Each item needs id, label, description, href, and
          category.
        </p>
        <MonoTextArea
          value={customJson}
          onChange={(event) => setCustomJson(event.target.value)}
          rows={8}
          spellCheck={false}
          className="text-emerald-200"
        />
        <Button variant="primary" onClick={saveCustom}>
          Save custom plugins
        </Button>
      </ToolSection>
    </ToolLayout>
  );
}
