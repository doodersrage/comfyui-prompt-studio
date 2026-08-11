export const PLUGIN_IFRAME_HOST_CHANNEL = 'comfyui-prompt-studio-plugin-host';

export type PluginIframeHostContext = {
  pluginId: string;
  pluginLabel?: string;
  model?: string;
  tool?: string;
  prompt?: string;
};

export type PluginIframeHostOutbound =
  | { channel: typeof PLUGIN_IFRAME_HOST_CHANNEL; type: 'host:ready'; pluginId: string }
  | {
      channel: typeof PLUGIN_IFRAME_HOST_CHANNEL;
      type: 'host:context';
      pluginId: string;
      context: PluginIframeHostContext;
    }
  | {
      channel: typeof PLUGIN_IFRAME_HOST_CHANNEL;
      type: 'host:queue-result';
      pluginId: string;
      ok: boolean;
      message: string;
      promptId?: string;
    };

export type PluginIframeHostInbound =
  | { channel: typeof PLUGIN_IFRAME_HOST_CHANNEL; type: 'plugin:resize'; height: number }
  | { channel: typeof PLUGIN_IFRAME_HOST_CHANNEL; type: 'plugin:navigate'; href: string }
  | { channel: typeof PLUGIN_IFRAME_HOST_CHANNEL; type: 'plugin:toast'; message: string }
  | {
      channel: typeof PLUGIN_IFRAME_HOST_CHANNEL;
      type: 'plugin:apply-prompt';
      prompt: string;
      negativePrompt?: string;
    }
  | {
      channel: typeof PLUGIN_IFRAME_HOST_CHANNEL;
      type: 'plugin:queue';
      prompt: string;
      negativePrompt?: string;
      model?: string;
      denoise?: number;
      cfg?: number;
    };

export function isPluginIframeHostMessage(value: unknown): value is PluginIframeHostInbound {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const raw = value as Record<string, unknown>;
  if (raw.channel !== PLUGIN_IFRAME_HOST_CHANNEL) {
    return false;
  }
  return (
    raw.type === 'plugin:resize' ||
    raw.type === 'plugin:navigate' ||
    raw.type === 'plugin:toast' ||
    raw.type === 'plugin:apply-prompt' ||
    raw.type === 'plugin:queue'
  );
}

export function postPluginIframeHostReady(
  iframe: HTMLIFrameElement | null,
  pluginId: string,
  targetOrigin = '*'
): void {
  if (!iframe?.contentWindow) {
    return;
  }
  const message: PluginIframeHostOutbound = {
    channel: PLUGIN_IFRAME_HOST_CHANNEL,
    type: 'host:ready',
    pluginId,
  };
  iframe.contentWindow.postMessage(message, targetOrigin);
}

export function postPluginIframeHostContext(
  iframe: HTMLIFrameElement | null,
  context: PluginIframeHostContext,
  targetOrigin = '*'
): void {
  if (!iframe?.contentWindow) {
    return;
  }
  const message: PluginIframeHostOutbound = {
    channel: PLUGIN_IFRAME_HOST_CHANNEL,
    type: 'host:context',
    pluginId: context.pluginId,
    context,
  };
  iframe.contentWindow.postMessage(message, targetOrigin);
}

export function postPluginIframeHostQueueResult(
  iframe: HTMLIFrameElement | null,
  result: { pluginId: string; ok: boolean; message: string; promptId?: string },
  targetOrigin = '*'
): void {
  if (!iframe?.contentWindow) {
    return;
  }
  const message: PluginIframeHostOutbound = {
    channel: PLUGIN_IFRAME_HOST_CHANNEL,
    type: 'host:queue-result',
    pluginId: result.pluginId,
    ok: result.ok,
    message: result.message,
    promptId: result.promptId,
  };
  iframe.contentWindow.postMessage(message, targetOrigin);
}

export function resolvePluginIframeTargetOrigin(iframeUrl: string): string {
  if (iframeUrl.startsWith('/')) {
    return window.location.origin;
  }
  try {
    return new URL(iframeUrl).origin;
  } catch {
    return '*';
  }
}

export function resolveEmbeddablePluginIframeUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}
