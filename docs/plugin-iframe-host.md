# Plugin iframe host protocol

Same-origin (or allowlisted) plugin tools render inside `/plugins/[id]` and talk to Prompt Studio via `postMessage`.

Channel string (required on every message):

```txt
comfyui-prompt-studio-plugin-host
```

Source of truth: `src/lib/plugin-iframe-host.ts`. Host page: `src/app/plugins/[id]/page.tsx`.

## Host → plugin

| `type` | Purpose |
| --- | --- |
| `host:ready` | Iframe loaded; safe to send plugin messages |
| `host:context` | Current plugin id, model, tool, prompt snapshot |
| `host:queue-result` | Outcome of a `plugin:queue` request (`ok`, `message`, optional `promptId`) |

## Plugin → host

| `type` | Purpose |
| --- | --- |
| `plugin:resize` | `{ height }` — grow the host frame |
| `plugin:navigate` | `{ href }` — in-app navigation (same origin paths) |
| `plugin:toast` | `{ message }` — tray toast |
| `plugin:apply-prompt` | `{ prompt, negativePrompt? }` — push text into Studio without queueing |
| `plugin:queue` | `{ prompt, negativePrompt?, model?, denoise?, cfg? }` — run host queue path |

## Minimal example

Serve any HTML from this app (same origin) and point a plugin tool `iframeUrl` at it, e.g. `/plugin-examples/hello-iframe.html`.

```js
const CHANNEL = 'comfyui-prompt-studio-plugin-host';

window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;
  if (data.type === 'host:ready') {
    // optional: window.parent.postMessage({ channel: CHANNEL, type: 'plugin:resize', height: 420 }, '*');
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
  '*'
);
```

Queue requests still run Studio preflight, plugin queue hooks, and gallery registration on the host side.
