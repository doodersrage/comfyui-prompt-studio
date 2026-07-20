"use client";

import type { ServerEnvGroup } from "@/lib/server-env-summary";
import { ToolSection } from "@/components/ui/ToolPageShell";

export default function ServerEnvPanel({
  groups,
}: {
  groups: ServerEnvGroup[];
}) {
  return (
    <ToolSection
      title="Server environment (.env.local)"
      description="Read-only view of values loaded at server start. Change these in .env.local and restart the dev server or container."
    >
      <p className="type-caption">
        Browser settings can override some ComfyUI and LLM behavior per session — look
        for the <strong className="font-medium text-zinc-300">UI override</strong> notes
        below.
      </p>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="ui-surface-inset space-y-3">
            <h3 className="type-heading">{group.title}</h3>
            <ul className="ui-list">
              {group.fields.map((field) => (
                <li key={field.key} className="ui-list-row flex-col !items-start gap-2 !min-h-0 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="type-heading">
                      <code className="text-violet-300">{field.key}</code>
                    </p>
                    <p className="type-caption">{field.label}</p>
                    {field.uiOverride ? (
                      <p className="type-caption text-emerald-300/90">
                        UI override: {field.uiOverride}
                      </p>
                    ) : null}
                    {field.hint ? <p className="type-caption">{field.hint}</p> : null}
                  </div>
                  <p
                    className={`type-body max-w-full break-all text-right sm:max-w-[45%] ${
                      field.configured ? "text-zinc-200" : "text-zinc-500"
                    }`}
                  >
                    {field.value}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="type-caption">
        Copy <code className="text-violet-300">.env.example</code> to{" "}
        <code className="text-violet-300">.env.local</code> at the project root. Secrets
        (API keys) are never shown here — only whether they are configured.
      </p>
    </ToolSection>
  );
}
