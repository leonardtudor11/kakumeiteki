import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compact, countMessages, budgetFor, needsCompaction } from '../src/context.js';
import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createMockProvider } from './helpers/mock-provider.js';

function longConversation() {
  const messages = [
    { role: 'system', content: 'SYSTEM PROMPT: you are a coding agent.' },
    { role: 'user', content: 'ORIGINAL TASK: refactor the auth module to use argon2.' },
  ];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: 'assistant', content: `step ${i}`, toolCalls: [{ name: 'read', args: { path: `f${i}.js` } }] });
    messages.push({ role: 'tool', name: 'read', content: 'x'.repeat(300) });
  }
  return messages;
}

test('compact: no-op when under budget', () => {
  const budget = budgetFor(8192);
  const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];
  const result = compact(messages, budget);
  assert.equal(result.compacted, false);
  assert.equal(result.messages, messages);
});

test('compact: over budget → fits, keeps system + original task + recent window', () => {
  const budget = budgetFor(2048, { reserve: 0, compactRatio: 0.8 });
  const messages = longConversation();
  assert.equal(needsCompaction(messages, budget), true);

  const { messages: out, compacted, dropped } = compact(messages, budget);
  assert.equal(compacted, true);
  assert.ok(dropped > 0);
  assert.ok(countMessages(out) <= budget.compactAt, 'compacted result must fit under threshold');

  assert.equal(out[0].role, 'system');
  assert.match(out[0].content, /SYSTEM PROMPT/);
  assert.match(out[1].content, /ORIGINAL TASK/, 'the goal must survive compaction (open-task state)');
  assert.match(out[2].content, /compacted to save context/);
  assert.match(out[2].content, /read×/, 'summary marker records dropped tool calls');

  const last = messages.at(-1);
  assert.deepEqual(out.at(-1), last, 'most recent turn kept verbatim');
});

test('compact: recent window never starts on an orphan tool result', () => {
  const budget = budgetFor(1536, { reserve: 0, compactRatio: 0.8 });
  const { messages: out, compacted } = compact(longConversation(), budget);
  assert.equal(compacted, true);
  const firstAfterMarker = out[3];
  assert.notEqual(firstAfterMarker?.role, 'tool', 'tail must not begin with a dangling tool result');
});

test('state-carry: a fact in the original task survives compaction', () => {
  const budget = budgetFor(2048, { reserve: 0, compactRatio: 0.8 });
  const { messages: out } = compact(longConversation(), budget);
  const flat = out.map((m) => m.content).join('\n');
  assert.match(flat, /argon2/, 'the specific requirement from the task is still present');
});

test('loop wiring: a tight budget triggers a compaction event mid-session', async () => {
  const base = mkdtempSync(join(tmpdir(), 'kaku-compact-'));
  mkdirSync(base, { recursive: true });
  try {
    const session = openSession({ dir: join(base, 's'), cwd: base, model: 'mock', tier: 'micro' });
    const turns = [];
    for (let i = 0; i < 8; i++) {
      turns.push({ text: '', toolCalls: [{ name: 'echo', args: { value: `call-${i}-${'x'.repeat(400)}` } }] });
    }
    turns.push({ text: 'done' });
    const mock = createMockProvider(turns);
    const bigEcho = { run: ({ value }) => value.repeat(3) };

    const budget = budgetFor(1024, { reserve: 0, compactRatio: 0.8 });
    const result = await runTurn({
      provider: mock,
      session,
      tools: { echo: bigEcho },
      messages: [{ role: 'system', content: 'sys' }],
      userInput: 'loop with big outputs',
      maxTurns: 12,
      budget,
    });
    assert.equal(result.status, 'done');
    const events = readSession(session.path).events;
    const compactions = events.filter((e) => e.type === 'compaction');
    assert.ok(compactions.length >= 1, 'expected at least one compaction under a tight budget');
    assert.ok(compactions[0].after < compactions[0].before, 'compaction must reduce token count');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('loop: no budget passed → no compaction (backward compatible)', async () => {
  const base = mkdtempSync(join(tmpdir(), 'kaku-nocompact-'));
  mkdirSync(base, { recursive: true });
  try {
    const session = openSession({ dir: join(base, 's'), cwd: base, model: 'mock', tier: 'micro' });
    const mock = createMockProvider([{ text: 'done immediately' }]);
    const result = await runTurn({ provider: mock, session, tools: {}, messages: [], userInput: 'hi' });
    assert.equal(result.status, 'done');
    assert.equal(readSession(session.path).events.filter((e) => e.type === 'compaction').length, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
