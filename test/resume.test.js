import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSession, readSession, rebuildMessages, loadSession, latestSessionFor, resolveSessionPath } from '../src/session.js';

test('rebuildMessages: reconstructs a clean multi-turn conversation', () => {
  const events = [
    { type: 'user_message', content: 'add slugify' },
    { type: 'assistant_message', content: 'reading', toolCalls: [{ name: 'read', args: { path: 'a.js' } }] },
    { type: 'tool_call', name: 'read', args: { path: 'a.js' } },
    { type: 'tool_result', name: 'read', ok: true, output: 'file contents' },
    { type: 'assistant_message', content: 'done', toolCalls: [] },
  ];
  const messages = rebuildMessages(events);
  assert.deepEqual(messages, [
    { role: 'user', content: 'add slugify' },
    { role: 'assistant', content: 'reading', toolCalls: [{ name: 'read', args: { path: 'a.js' } }] },
    { role: 'tool', name: 'read', content: 'file contents' },
    { role: 'assistant', content: 'done', toolCalls: [] },
  ]);
});

test('rebuildMessages: dangling tool call (crash mid-turn) → synthesized [interrupted]', () => {
  const events = [
    { type: 'user_message', content: 'go' },
    { type: 'assistant_message', content: '', toolCalls: [{ name: 'bash', args: { command: 'sleep 99' } }] },
    { type: 'tool_call', name: 'bash', args: { command: 'sleep 99' } },
    // crashed before tool_result
  ];
  const messages = rebuildMessages(events);
  assert.equal(messages.at(-1).role, 'tool');
  assert.equal(messages.at(-1).name, 'bash');
  assert.equal(messages.at(-1).content, '[interrupted]');
});

test('rebuildMessages: partial multi-call turn → only the unanswered call is interrupted', () => {
  const events = [
    { type: 'user_message', content: 'go' },
    { type: 'assistant_message', content: '', toolCalls: [{ name: 'read', args: {} }, { name: 'grep', args: {} }] },
    { type: 'tool_result', name: 'read', ok: true, output: 'ok' },
    // grep never returned
  ];
  const messages = rebuildMessages(events);
  const tools = messages.filter((m) => m.role === 'tool');
  assert.equal(tools.length, 2);
  assert.equal(tools[0].content, 'ok');
  assert.equal(tools[1].name, 'grep');
  assert.equal(tools[1].content, '[interrupted]');
});

test('rebuildMessages: repair and doom_nudge become user nudges; meta events skipped', () => {
  const events = [
    { type: 'user_message', content: 'go' },
    { type: 'assistant_message', content: 'oops', toolCalls: [] },
    { type: 'repair', message: 'not valid JSON' },
    { type: 'compaction', before: 100, after: 40 },
    { type: 'assistant_message', content: 'fixed', toolCalls: [] },
  ];
  const messages = rebuildMessages(events);
  assert.equal(messages.filter((m) => m.role === 'user').length, 2);
  assert.match(messages[2].content, /tool protocol error.*not valid JSON/);
  assert.ok(!messages.some((m) => String(m.content).includes('compaction')));
});

test('loadSession: header + rebuilt messages round-trip through a real file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-resume-'));
  try {
    const s = openSession({ dir, cwd: '/proj', model: 'qwen3.5:4b', tier: 'micro' });
    s.append('user_message', { content: 'task one' });
    s.append('assistant_message', { content: 'answer', toolCalls: [] });
    const { header, messages } = loadSession(s.path);
    assert.equal(header.model, 'qwen3.5:4b');
    assert.equal(header.cwd, '/proj');
    assert.deepEqual(messages, [
      { role: 'user', content: 'task one' },
      { role: 'assistant', content: 'answer', toolCalls: [] },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('latestSessionFor: picks newest session matching cwd, ignores other cwds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-latest-'));
  try {
    let t = 0;
    const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++));
    openSession({ dir, cwd: '/proj-a', model: 'm', tier: 'micro', now: clock });
    openSession({ dir, cwd: '/proj-b', model: 'm', tier: 'micro', now: clock });
    const newestA = openSession({ dir, cwd: '/proj-a', model: 'm', tier: 'micro', now: clock });
    assert.equal(latestSessionFor(dir, '/proj-a'), newestA.path);
    assert.equal(latestSessionFor(dir, '/proj-c'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveSessionPath: accepts full path, bare id, or id.jsonl; throws on miss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-resolve-'));
  try {
    const s = openSession({ dir, cwd: '/p', model: 'm', tier: 'micro' });
    const id = s.path.split('/').pop().replace('.jsonl', '');
    assert.equal(resolveSessionPath(dir, s.path), s.path);
    assert.equal(resolveSessionPath(dir, id), s.path);
    assert.throws(() => resolveSessionPath(dir, 'nope'), /session not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reopen semantics: appended session stays readable and ordered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-reopen-'));
  try {
    const s = openSession({ dir, cwd: '/p', model: 'm', tier: 'micro' });
    s.append('user_message', { content: 'first' });
    const { events } = readSession(s.path);
    assert.equal(events.length, 1);
    assert.equal(events[0].content, 'first');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
