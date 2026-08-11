'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  getInstalledPlugin,
  primaryToolForPlugin,
  type PluginManifest,
} from '@/lib/plugin-manifest';
import {
  isPluginIframeHostMessage,
  postPluginIframeHostContext,
  postPluginIframeHostReady,
  resolveEmbeddablePluginIframeUrl,
  resolvePluginIframeTargetOrigin,
  type PluginIframeHostContext,
} from '@/lib/plugin-iframe-host';
import { loadSettingsCache } from '@/lib/settings-cache';
import { loadLastToolDraft } from '@/lib/tool-draft-memory';
import { toastQueueOutcome } from '@/lib/app-toast';

type PluginDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default function PluginDetailPage({ params }: PluginDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [plugin, setPlugin] = useState<PluginManifest | null | undefined>(undefined);
  const [iframeHeight, setIframeHeight] = useState(720);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPlugin(getInstalledPlugin(id));
    });
  }, [id]);

  const pushHostContext = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !plugin) {
      return;
    }
    const tool = primaryToolForPlugin(plugin);
    const iframeUrl = resolveEmbeddablePluginIframeUrl(tool?.iframeUrl);
    if (!iframeUrl) {
      return;
    }
    const shared = loadSettingsCache().shared;
    const draft = loadLastToolDraft();
    const context: PluginIframeHostContext = {
      pluginId: plugin.id,
      pluginLabel: plugin.label,
      model: shared.model,
      tool: draft?.toolKey,
      prompt: draft?.preview?.slice(0, 500),
    };
    postPluginIframeHostReady(iframe, plugin.id, resolvePluginIframeTargetOrigin(iframeUrl));
    postPluginIframeHostContext(iframe, context, resolvePluginIframeTargetOrigin(iframeUrl));
  }, [plugin]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPluginIframeHostMessage(event.data)) {
        return;
      }
      if (event.data.type === 'plugin:resize' && Number.isFinite(event.data.height)) {
        setIframeHeight(Math.min(Math.max(event.data.height, 320), 1200));
        return;
      }
      if (event.data.type === 'plugin:navigate' && event.data.href.startsWith('/')) {
        router.push(event.data.href);
        return;
      }
      if (event.data.type === 'plugin:toast' && event.data.message.trim()) {
        toastQueueOutcome({ ok: true, text: event.data.message.trim() });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router]);

  if (plugin === undefined) {
    return (
      <ToolLayout
        accent="violet"
        badge={<ToolBadge accent="violet">Plugin</ToolBadge>}
        title="Loading…"
        description="Resolving installed plugin manifest."
      >
        <p className="type-caption text-[var(--text-muted)]">Loading plugin…</p>
      </ToolLayout>
    );
  }

  if (!plugin) {
    return (
      <ToolLayout
        accent="violet"
        badge={<ToolBadge accent="violet">Plugin</ToolBadge>}
        title="Plugin not found"
        description={`No installed plugin matches “${id}”.`}
      >
        <ToolSection title="Missing manifest">
          <p className="type-caption">
            Import a JSON manifest from the{' '}
            <Link
              href="/plugins"
              className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Plugins
            </Link>{' '}
            page to install a runtime plugin.
          </p>
          <ButtonLink href="/plugins" size="sm" variant="secondary" className="mt-4">
            Back to plugins
          </ButtonLink>
        </ToolSection>
      </ToolLayout>
    );
  }

  const tool = primaryToolForPlugin(plugin);
  const iframeUrl = resolveEmbeddablePluginIframeUrl(tool?.iframeUrl);

  if (iframeUrl) {
    return (
      <ToolLayout
        accent="violet"
        width="full"
        badge={<ToolBadge accent="violet">Plugin</ToolBadge>}
        title={tool?.title || plugin.label}
        description={`${plugin.label} · v${plugin.version}`}
      >
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] shadow-[var(--shadow-soft)]">
          <iframe
            ref={iframeRef}
            title={tool?.title || plugin.label}
            src={iframeUrl}
            onLoad={pushHostContext}
            className="block w-full bg-[var(--surface)]"
            style={{ height: `min(78vh, ${iframeHeight}px)` }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Plugin</ToolBadge>}
      title={plugin.label}
      description={`Installed runtime plugin · v${plugin.version}`}
    >
      <ToolSection title="Plugin info">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="type-overline">Id</dt>
            <dd className="type-caption font-mono text-[var(--text-secondary)]">{plugin.id}</dd>
          </div>
          <div className="space-y-1">
            <dt className="type-overline">Version</dt>
            <dd className="type-caption text-[var(--text-secondary)]">{plugin.version}</dd>
          </div>
          <div className="space-y-1">
            <dt className="type-overline">Status</dt>
            <dd className="type-caption text-[var(--text-secondary)]">
              {plugin.enabled === false ? 'Disabled' : 'Enabled'}
            </dd>
          </div>
          {plugin.queueHooks?.url ? (
            <div className="space-y-1 sm:col-span-2">
              <dt className="type-overline">Queue hook</dt>
              <dd className="type-caption break-all text-[var(--text-secondary)]">
                {plugin.queueHooks.url}
                {plugin.queueHooks.events?.length
                  ? ` · ${plugin.queueHooks.events.join(', ')}`
                  : ''}
              </dd>
            </div>
          ) : null}
          {plugin.presetProvider?.catalogUrl ? (
            <div className="space-y-1 sm:col-span-2">
              <dt className="type-overline">Preset catalog</dt>
              <dd className="type-caption break-all text-[var(--text-secondary)]">
                {plugin.presetProvider.kind} · {plugin.presetProvider.catalogUrl}
              </dd>
            </div>
          ) : null}
        </dl>
      </ToolSection>

      {plugin.tools?.length ? (
        <ToolSection title="Tools" variant="secondary">
          <ul className="ui-list">
            {plugin.tools.map(entry => (
              <li key={entry.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{entry.title}</p>
                  <p className="type-caption">
                    {entry.route
                      ? `Route ${entry.route}`
                      : entry.iframeUrl
                        ? `Iframe ${entry.iframeUrl}`
                        : 'No surface configured'}
                  </p>
                </div>
                {entry.route ? (
                  <ButtonLink href={entry.route} size="sm" variant="accent-outline">
                    Open
                  </ButtonLink>
                ) : null}
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      {plugin.nav?.length ? (
        <ToolSection title="Nav entries" variant="secondary">
          <ul className="ui-list">
            {plugin.nav.map(entry => (
              <li key={entry.href} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{entry.label}</p>
                  <p className="type-caption">{entry.description}</p>
                </div>
                <ButtonLink href={entry.href} size="sm" variant="secondary">
                  Open
                </ButtonLink>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      <ButtonLink href="/plugins" size="sm" variant="secondary">
        Manage plugins
      </ButtonLink>
    </ToolLayout>
  );
}
