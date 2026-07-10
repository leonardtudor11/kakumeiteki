import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProvider, EndpointError } from '../src/provider.js';
import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createJail } from '../src/permissions.js';
import { createTools } from '../src/tools/index.js';
import { DEFAULTS } from '../src/config.js';
import { createMockProvider } from './helpers/mock-provider.js';

const baseConfig = { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'test-model', numCtx: null };

function okStream(text) {
  const encoder = new TextEncoder();
  const line = JSON.stringify({ message: { role: 'assistant', content: text }, done: true }) + '\n';
  return new Response(new ReadableStream({
    start(c) { c.enqueue(encoder.encode(line)); c.close(); },
  }));
}

function connError(code) {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

test('chat retries on ECONNRESET then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) throw connError('ECONNRESET');
    return okStream('recovered');
  };
  const provider = createProvider(baseConfig, { fetchImpl, backoffMs: [0, 0] });
  const msg = await provider.chat({ messages: [] });
  assert.equal(msg.content, 'recovered');
  assert.equal(calls, 2);
});

test('chat retries twice then throws actionable EndpointError', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw connError('ECONNREFUSED'); };
  const provider = createProvider(baseConfig, { fetchImpl, backoffMs: [0, 0] });
  await assert.rejects(provider.chat({ messages: [] }), (err) => {
    assert.equal(err.name, 'EndpointError');
    assert.match(err.message, /after 3 attempts/);
    assert.match(err.message, /--continue/);
    return true;
  });
  assert.equal(calls, 3);
});

test('404 is not retried (not transient)', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response('nope', { status: 404 }); };
  const provider = createProvider(baseConfig, { fetchImpl, backoffMs: [0, 0] });
  await assert.rejects(provider.chat({ messages: [] }), /ollama pull test-model/);
  assert.equal(calls, 1);
});

test('abort during backoff does not retry', async () => {
  let calls = 0;
  const controller = new AbortController();
  const fetchImpl = async () => { calls++; controller.abort(); throw connError('ECONNRESET'); };
  const provider = createProvider(baseConfig, { fetchImpl, backoffMs: [1000, 1000] });
  await assert.rejects(provider.chat({ messages: [], signal: controller.signal }), (err) => err.name === 'AbortError');
  assert.equal(calls, 1);
});

function agentSetup() {
  const base = mkdtempSync(join(tmpdir(), 'kaku-resil-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'app.js'), 'x\n');
  const jail = createJail(root);
  const tools = createTools({ jail, config: { ...DEFAULTS, permissions: 'auto' } });
  const session = openSession({ dir: join(base, 's'), cwd: root, model: 'mock', tier: 'micro' });
  return { tools, session, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const types = (session) => readSession(session.path).events.map((e) => e.type);

test('doom-loop guard: 3 identical calls → nudge, 4th identical → doom_loop abort', async () => {
  const { tools, session, cleanup } = agentSetup();
  try {
    const repeat = { text: '```tool\n{"name": "ls", "args": {}}\n```' };
    const mock = createMockProvider([repeat, repeat, repeat, repeat, { text: 'never' }]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'doom_loop');
    const t = types(session);
    assert.equal(t.filter((x) => x === 'doom_nudge').length, 1);
    assert.equal(t.filter((x) => x === 'doom_loop').length, 1);
    assert.equal(t.filter((x) => x === 'tool_result').length, 2, 'first two identical calls execute, third is nudged not run');
  } finally {
    cleanup();
  }
});

test('doom-loop guard: nudge lets model recover with a different call', async () => {
  const { tools, session, cleanup } = agentSetup();
  try {
    const ls = { text: '```tool\n{"name": "ls", "args": {}}\n```' };
    const mock = createMockProvider([
      ls, ls, ls,
      { text: '```tool\n{"name": "read", "args": {"path": "app.js"}}\n```' },
      { text: 'recovered and done' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    const t = types(session);
    assert.equal(t.filter((x) => x === 'doom_nudge').length, 1);
    assert.equal(t.filter((x) => x === 'doom_loop').length, 0);
  } finally {
    cleanup();
  }
});

test('different args do not count as identical (guard is precise)', async () => {
  const { tools, session, cleanup } = agentSetup();
  try {
    const mock = createMockProvider([
      { text: '```tool\n{"name": "grep", "args": {"pattern": "a"}}\n```' },
      { text: '```tool\n{"name": "grep", "args": {"pattern": "b"}}\n```' },
      { text: '```tool\n{"name": "grep", "args": {"pattern": "c"}}\n```' },
      { text: 'done, three distinct searches' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(types(session).filter((x) => x === 'doom_nudge').length, 0);
  } finally {
    cleanup();
  }
});

test('EndpointError mid-turn → endpoint_error status, session resumable (no throw)', async () => {
  const { tools, session, cleanup } = agentSetup();
  try {
    const dying = {
      name: 'ollama',
      async chat() { throw new EndpointError('model endpoint failed after 3 attempts (ECONNRESET) — Resume with --continue.'); },
    };
    const result = await runTurn({ provider: dying, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'endpoint_error');
    assert.match(result.error, /ECONNRESET/);
    const t = types(session);
    assert.equal(t.at(-1), 'endpoint_error');
    assert.equal(t[0], 'user_message');
  } finally {
    cleanup();
  }
});

test('a real programming error still throws (not swallowed as endpoint)', async () => {
  const { tools, session, cleanup } = agentSetup();
  try {
    const buggy = { name: 'x', async chat() { throw new TypeError('cannot read property foo of undefined'); } };
    await assert.rejects(
      runTurn({ provider: buggy, session, tools, messages: [], userInput: 'go' }),
      /cannot read property foo/,
    );
  } finally {
    cleanup();
  }
});
