import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAllowedPluginMessageOrigin,
  isPluginIframeHostMessage,
  PLUGIN_IFRAME_HOST_CHANNEL,
  resolveEmbeddablePluginIframeUrl,
} from './plugin-iframe-host';

describe('plugin-iframe-host', () => {
  it('accepts known inbound message types', () => {
    assert.equal(
      isPluginIframeHostMessage({
        channel: PLUGIN_IFRAME_HOST_CHANNEL,
        type: 'plugin:apply-model',
        model: 'flux-dev',
      }),
      true
    );
    assert.equal(
      isPluginIframeHostMessage({
        channel: PLUGIN_IFRAME_HOST_CHANNEL,
        type: 'plugin:pick-gallery',
        target: 'controlnet',
      }),
      true
    );
    assert.equal(
      isPluginIframeHostMessage({
        channel: 'other',
        type: 'plugin:queue',
        prompt: 'x',
      }),
      false
    );
  });

  it('resolves same-origin embed urls', () => {
    assert.equal(resolveEmbeddablePluginIframeUrl('/plugin-examples/hello-iframe.html'), '/plugin-examples/hello-iframe.html');
    assert.equal(resolveEmbeddablePluginIframeUrl('javascript:alert(1)'), null);
  });

  it('allows matching message origins for absolute iframe urls', () => {
    assert.equal(
      isAllowedPluginMessageOrigin('https://example.com', 'https://example.com/plugin.html'),
      true
    );
    assert.equal(
      isAllowedPluginMessageOrigin('https://evil.test', 'https://example.com/plugin.html'),
      false
    );
  });
});
