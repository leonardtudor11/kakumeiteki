import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createMockProvider } from './helpers/mock-provider.js';

function tempSession() {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-session-'));
  const session = openSession({ dir, cwd: '/fake/project', model: 'mock', tier: 'micro' });
  return { session, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const echoTool = { run: ({ value }) => `echo:${value}` };

test('session: header line then appended events, readable back', () => {
  const { session, cleanup } = tempSession();
  try {
    session.append('user_message', { content: 'hi' });
    const { header, events } = readSession(session.path);
    assert.equal(header.v, 1);
    assert.equal(header.cwd, '/fake/project');
    assert.equal(header.model, 'mock');
    assert.equal(header.tier, 'micro');
    assert.ok(header.startedAt);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'user_message');
    assert.equal(events[0].content, 'hi');
    assert.ok(events[0].at);
  } finally {
    cleanup();
  }
});

test('gate (b): mock drives loop through 2 tool round-trips to final message, exact event sequence', async () => {
  const mock = createMockProvider([
    { text: 'reading file', toolCalls: [{ name: 'echo', args: { value: 'one' } }] },
    { text: '', toolCalls: [{ name: 'echo', args: { value: 'two' } }] },
    { text: 'all done', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const messages = [];
    const result = await runTurn({
      provider: mock,
      session,
      tools: { echo: echoTool },
      messages,
      userInput: 'do the thing',
    });

    assert.equal(result.status, 'done');
    assert.equal(result.message.content, 'all done');

    const { events } = readSession(session.path);
    assert.deepEqual(events.map((e) => e.type), [
      'user_message',
      'assistant_message',
      'tool_call',
      'tool_result',
      'assistant_message',
      'tool_call',
      'tool_result',
      'assistant_message',
    ]);
    assert.deepEqual(events.filter((e) => e.type === 'tool_result').map((e) => e.output), ['echo:one', 'echo:two']);
    assert.ok(events.filter((e) => e.type === 'tool_result').every((e) => e.ok));

    assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);

    const secondRequest = mock.requests[1].messages;
    assert.equal(secondRequest.at(-1).role, 'tool');
    assert.equal(secondRequest.at(-1).content, 'echo:one');
  } finally {
    cleanup();
  }
});

test('unknown tool → error fed back to model, loop continues', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'missing', args: {} }] },
    { text: 'recovered', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const messages = [];
    const result = await runTurn({ provider: mock, session, tools: { echo: echoTool }, messages, userInput: 'go' });
    assert.equal(result.status, 'done');
    const { events } = readSession(session.path);
    const toolResult = events.find((e) => e.type === 'tool_result');
    assert.equal(toolResult.ok, false);
    assert.match(toolResult.output, /unknown tool "missing"/);
    assert.match(toolResult.output, /Available tools: echo/);
    assert.match(mock.requests[1].messages.at(-1).content, /unknown tool/);
  } finally {
    cleanup();
  }
});

test('tool throws → [tool error] result, loop survives', async () => {
  const boom = { run: () => { throw new Error('disk on fire'); } };
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'boom', args: {} }] },
    { text: 'noted', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({ provider: mock, session, tools: { boom }, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    const { events } = readSession(session.path);
    const toolResult = events.find((e) => e.type === 'tool_result');
    assert.equal(toolResult.ok, false);
    assert.match(toolResult.output, /\[tool error\] disk on fire/);
  } finally {
    cleanup();
  }
});

test('turn cap → status turn_cap, honest event, no crash', async () => {
  const forever = Array.from({ length: 10 }, () => ({ text: '', toolCalls: [{ name: 'echo', args: { value: 'x' } }] }));
  const mock = createMockProvider(forever);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({
      provider: mock,
      session,
      tools: { echo: echoTool },
      messages: [],
      userInput: 'go',
      maxTurns: 3,
    });
    assert.equal(result.status, 'turn_cap');
    const { events } = readSession(session.path);
    assert.equal(events.at(-1).type, 'turn_cap');
    assert.equal(events.at(-1).maxTurns, 3);
    assert.equal(events.filter((e) => e.type === 'assistant_message').length, 3);
  } finally {
    cleanup();
  }
});

// ---- verified-confidence line (IMPROVE §2): computed by the harness, never the model

const fakeWrite = { run: () => 'wrote 10 bytes to a.js' };
const fakeBash = { run: () => 'all tests pass' };

test('verify-nudge: fabricated "done" after a write gets one nudge; compliant check → verified line', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'write', args: { path: 'a.js', content: 'x' } }] },
    { text: 'Done. All tests pass.', toolCalls: [] }, // fabrication — nothing ran
    { text: '', toolCalls: [{ name: 'bash', args: { command: 'node --test a.test.js' } }] },
    { text: 'Done. Tests actually pass.', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({ provider: mock, session, tools: { write: fakeWrite, bash: fakeBash }, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(result.verification, 'verified 1/1 · node --test a.test.js → exit 0 · changed: a.js');
    const { events } = readSession(session.path);
    assert.equal(events.filter((e) => e.type === 'verify_nudge').length, 1);
    assert.match(mock.requests[2].messages.at(-1).content, /\[unverified\]/);
  } finally {
    cleanup();
  }
});

test('verify-nudge fires once: second unchecked "done" is accepted with a loud UNVERIFIED line', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'write', args: { path: 'a.js', content: 'x' } }] },
    { text: 'Done.', toolCalls: [] },
    { text: 'Done, trust me.', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({ provider: mock, session, tools: { write: fakeWrite }, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(result.verification, 'UNVERIFIED — no check ran · changed: a.js');
    const { events } = readSession(session.path);
    assert.equal(events.filter((e) => e.type === 'verify_nudge').length, 1);
  } finally {
    cleanup();
  }
});

test('mute model after verify-nudge: pre-nudge answer survives with UNVERIFIED label', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'write', args: { path: 'a.js', content: 'x' } }] },
    { text: 'Done. Changed a.js.', toolCalls: [] }, // good answer, no check
    { text: '', toolCalls: [] }, // mute after verify-nudge
    { text: '', toolCalls: [] }, // mute after empty-nudge
  ]);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({ provider: mock, session, tools: { write: fakeWrite }, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(result.message.content, 'Done. Changed a.js.');
    assert.equal(result.verification, 'UNVERIFIED — no check ran · changed: a.js');
    const { events } = readSession(session.path);
    assert.equal(events.filter((e) => e.type === 'verify_fallback').length, 1);
    assert.equal(events.filter((e) => e.type === 'empty_answer').length, 0);
  } finally {
    cleanup();
  }
});

test('read-only turn: no verify nudge, no verification field', async () => {
  const mock = createMockProvider([
    { text: '', toolCalls: [{ name: 'echo', args: { value: 'x' } }] },
    { text: 'answer: it is defined in a.js', toolCalls: [] },
  ]);
  const { session, cleanup } = tempSession();
  try {
    const result = await runTurn({ provider: mock, session, tools: { echo: echoTool }, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(result.verification, null);
    const { events } = readSession(session.path);
    assert.equal(events.filter((e) => e.type === 'verify_nudge').length, 0);
  } finally {
    cleanup();
  }
});
