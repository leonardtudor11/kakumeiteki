import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createMockProvider } from './helpers/mock-provider.js';

function tempSession() {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-cancel-'));
  const session = openSession({ dir, cwd: '/fake/project', model: 'mock', tier: 'micro' });
  return { session, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const echoTool = { run: ({ value }) => `echo:${value}` };

test('gate (c): abort mid-first-model-turn → cancelled event, clean return', async () => {
  const mock = createMockProvider([{ hang: true }]);
  const { session, cleanup } = tempSession();
  try {
    const controller = new AbortController();
    const pending = runTurn({
      provider: mock,
      session,
      tools: {},
      messages: [],
      userInput: 'long task',
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;

    assert.equal(result.status, 'cancelled');
    const { events } = readSession(session.path);
    assert.deepEqual(events.map((e) => e.type), ['user_message', 'cancelled']);
  } finally {
    cleanup();
  }
});

test('abort after a completed tool round-trip → history intact, no dangling tool call', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'echo', args: { value: 'one' } }] },
    { hang: true },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const controller = new AbortController();
    const messages = [];
    const originalChat = mock.chat.bind(mock);
    let calls = 0;
    mock.chat = (opts) => {
      calls++;
      if (calls === 2) queueMicrotask(() => controller.abort());
      return originalChat(opts);
    };

    const result = await runTurn({
      provider: mock,
      session,
      tools: { echo: echoTool },
      messages,
      userInput: 'go',
      signal: controller.signal,
    });

    assert.equal(result.status, 'cancelled');
    const { events } = readSession(session.path);
    assert.deepEqual(events.map((e) => e.type), [
      'user_message',
      'assistant_message',
      'tool_call',
      'tool_result',
      'cancelled',
    ]);
    assert.equal(messages.at(-1).role, 'tool');
    assert.equal(messages.at(-1).content, 'echo:one');
  } finally {
    cleanup();
  }
});

test('signal already aborted before turn starts → cancelled immediately', async () => {
  const mock = createMockProvider([{ text: 'never runs', toolCalls: [] }]);
  const { session, cleanup } = tempSession();
  try {
    const controller = new AbortController();
    controller.abort();
    const result = await runTurn({
      provider: mock,
      session,
      tools: {},
      messages: [],
      userInput: 'go',
      signal: controller.signal,
    });
    assert.equal(result.status, 'cancelled');
    const { events } = readSession(session.path);
    assert.equal(events.at(-1).type, 'cancelled');
  } finally {
    cleanup();
  }
});
