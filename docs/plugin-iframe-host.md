# Plugin iframe host protocol

Same-origin (or allowlisted) plugin tools render inside `/plugins/[id]` and talk to Prompt Studio via `postMessage`.

Channel string (required on every message):

```txt
comfyui-prompt-studio-plugin-host
```

Source of truth: `src/lib/plugin-iframe-host.ts`. Host page: `src/app/plugins/[id]/page.tsx`.

## Origin security (default-deny)

- Messages are accepted only when `event.origin` matches the iframe URL origin, **or** an origin listed under Plugins → Iframe origin allowlist.
- Unresolvable / wildcard iframe targets are **denied** unless the posting origin is explicitly allowlisted.
- Same-origin relative `iframeUrl` values (starting with `/`) use the Studio page origin.

Recommended remote plugin host headers:

```http
Content-Security-Policy: frame-ancestors 'self' https://your-studio.example
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

The host iframe uses:

```html
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
referrerPolicy="strict-origin-when-cross-origin"
allow="clipboard-write"
```

Do **not** add `allow-top-navigation` unless you fully trust the plugin. Prefer `plugin:navigate` for in-app routes.

## Host → plugin

| `type` | Purpose |
| --- | --- |
| `host:ready` | Iframe loaded; safe to send plugin messages |
| `host:context` | Snapshot: plugin id, model, tool, prompt, quality profile, active LoRA ids, selected workflow id |
| `host:queue-result` | Outcome of a `plugin:queue` request (`ok`, `message`, optional `promptId`) |
| `host:apply-result` | Outcome of apply-prompt / apply-model / apply-quality |

## Plugin → host

| `type` | Purpose |
| --- | --- |
| `plugin:resize` | `{ height }` — grow the host frame |
| `plugin:navigate` | `{ href }` — in-app navigation (same origin paths) |
| `plugin:toast` | `{ message }` — tray toast |
| `plugin:apply-prompt` | `{ prompt, negativePrompt? }` — push text into Studio without queueing |
| `plugin:apply-model` | `{ model }` — set shared target model |
| `plugin:apply-quality` | `{ qualityProfile: draft\|final\|max\|followSettings }` |
| `plugin:pick-gallery` | `{ target? }` — open Gallery pick mode for compose/refine/controlnet/… |
| `plugin:queue` | `{ prompt, negativePrompt?, model?, denoise?, cfg?, qualityProfile? }` — run host queue path |

## Minimal example

Serve any HTML from this app (same origin) and point a plugin tool `iframeUrl` at it, e.g. `/plugin-examples/hello-iframe.html`.

```js
const CHANNEL = 'comfyui-prompt-studio-plugin-host';

window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;
  if (data.type === 'host:ready') {
    // Prefer posting back to event.origin instead of '*'.
    // window.parent.postMessage({ channel: CHANNEL, type: 'plugin:resize', height: 420 }, event.origin);
  }
  if (data.type === 'host:queue-result') {
    console.log(data.ok ? 'queued' : 'failed', data.message, data.promptId);
  }
});

window.parent.postMessage(
  {
    channel: CHANNEL,
    type: 'plugin:queue',
    prompt: 'a cat sitting on a windowsill, soft daylight',
  },
  window.location.origin
);
```

Queue requests still run Studio preflight, plugin queue hooks, and gallery registration on the host side.
