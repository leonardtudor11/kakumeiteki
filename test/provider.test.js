import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProvider, ndjsonLines } from '../src/provider.js';
import { createMockProvider } from './helpers/mock-provider.js';

function streamOf(...parts) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

function collect(asyncGen) {
  return (async () => {
    const out = [];
    for await (const item of asyncGen) out.push(item);
    return out;
  })();
}

const baseConfig = {
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'test-model',
  numCtx: null,
};

test('ndjsonLines: reassembles lines split across chunks', async () => {
  const stream = streamOf('{"a":', '1}\n{"b"', ':2}\n');
  const items = await collect(ndjsonLines(stream));
  assert.deepEqual(items, [{ a: 1 }, { b: 2 }]);
});

test('ndjsonLines: flushes trailing line without newline', async () => {
  const stream = streamOf('{"a":1}\n{"b":2}');
  const items = await collect(ndjsonLines(stream));
  assert.deepEqual(items, [{ a: 1 }, { b: 2 }]);
});

test('ndjsonLines: skips blank lines', async () => {
  const stream = streamOf('{"a":1}\n\n\n{"b":2}\n');
  const items = await collect(ndjsonLines(stream));
  assert.deepEqual(items, [{ a: 1 }, { b: 2 }]);
});

test('ollama chat: accumulates streamed content, fires deltas, stops at done', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(streamOf(
      '{"message":{"role":"assistant","content":"Hel"},"done":false}\n',
      '{"message":{"role":"assistant","content":"lo"},"done":false}\n',
      '{"message":{"role":"assistant","content":""},"done":true}\n',
    ));
  };
  const provider = createProvider(baseConfig, { fetchImpl });
  const deltas = [];
  const msg = await provider.chat({
    messages: [{ role: 'user', content: 'hi' }],
    onDelta: (d) => deltas.push(d),
  });
  assert.equal(msg.content, 'Hello');
  assert.deepEqual(msg.toolCalls, []);
  assert.deepEqual(deltas, ['Hel', 'lo']);
  assert.equal(captured.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(captured.body.model, 'test-model');
  assert.equal(captured.body.stream, true);
  assert.equal('options' in captured.body, false);
});

test('ollama chat: numCtx set → options.num_ctx in request body', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = JSON.parse(init.body);
    return new Response(streamOf('{"message":{"role":"assistant","content":"ok"},"done":true}\n'));
  };
  const provider = createProvider({ ...baseConfig, numCtx: 8192 }, { fetchImpl });
  await provider.chat({ messages: [] });
  assert.deepEqual(captured.options, { num_ctx: 8192 });
});

test('ollama chat: normalizes tool_calls', async () => {
  const fetchImpl = async () => new Response(streamOf(
    '{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"read","arguments":{"path":"a.js"}}}]},"done":true}\n',
  ));
  const provider = createProvider(baseConfig, { fetchImpl });
  const msg = await provider.chat({ messages: [] });
  assert.deepEqual(msg.toolCalls, [{ name: 'read', args: { path: 'a.js' } }]);
});

test('ollama chat: 404 → actionable ollama pull hint', async () => {
  const fetchImpl = async () => new Response('not found', { status: 404 });
  const provider = createProvider(baseConfig, { fetchImpl });
  await assert.rejects(
    provider.chat({ messages: [] }),
    /ollama pull test-model/,
  );
});

test('ollama chat: 5xx → error carries response body', async () => {
  const fetchImpl = async () => new Response('out of memory', { status: 500 });
  const provider = createProvider(baseConfig, { fetchImpl });
  await assert.rejects(provider.chat({ messages: [] }), /HTTP 500.*out of memory/s);
});

test('ollama chat: stream error field → throws', async () => {
  const fetchImpl = async () => new Response(streamOf('{"error":"model crashed"}\n'));
  const provider = createProvider(baseConfig, { fetchImpl });
  await assert.rejects(provider.chat({ messages: [] }), /model crashed/);
});

test('preflight: connection refused → actionable message', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  const provider = createProvider(baseConfig, { fetchImpl });
  await assert.rejects(provider.preflight(), /ollama serve.*ECONNREFUSED/s);
});

test('unimplemented provider → clear error', () => {
  assert.throws(
    () => createProvider({ ...baseConfig, provider: 'openai-compat' }),
    /Phase 3/,
  );
});

test('mock provider: plays scripted turns in order, records requests', async () => {
  const mock = createMockProvider([
    { text: 'first', toolCalls: [{ name: 'read', args: { path: 'x' } }] },
    { text: 'second' },
  ]);
  const deltas = [];
  const one = await mock.chat({ messages: [{ role: 'user', content: 'go' }], onDelta: (d) => deltas.push(d) });
  const two = await mock.chat({ messages: [] });
  assert.equal(one.content, 'first');
  assert.deepEqual(one.toolCalls, [{ name: 'read', args: { path: 'x' } }]);
  assert.equal(two.content, 'second');
  assert.equal(deltas.join(''), 'first');
  assert.equal(mock.requests.length, 2);
});

test('mock provider: abort mid-hang rejects with AbortError', async () => {
  const mock = createMockProvider([{ hang: true, text: 'never' }]);
  const controller = new AbortController();
  const pending = mock.chat({ messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (err) => err.name === 'AbortError');
});

test('mock provider: script exhaustion → loud error', async () => {
  const mock = createMockProvider([]);
  await assert.rejects(mock.chat({ messages: [] }), /exhausted/);
});
