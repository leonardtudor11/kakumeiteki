import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createMockProvider } from './helpers/mock-provider.js';

const SECRET = 'ghp_' + 'z'.repeat(30);

function tempSession() {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-redpipe-'));
  mkdirSync(dir, { recursive: true });
  const session = openSession({ dir, cwd: dir, model: 'mock', tier: 'micro' });
  return { dir, session, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('session.append redacts secrets before persist', () => {
  const { session, cleanup } = tempSession();
  try {
    session.append('assistant_message', { content: `here is the token ${SECRET}`, toolCalls: [] });
    const raw = readFileSync(session.path, 'utf8');
    assert.ok(!raw.includes(SECRET), 'raw transcript must not contain the secret');
    assert.match(raw, /\[REDACTED:R2\]/);
  } finally {
    cleanup();
  }
});

test('tool output carrying a secret never reaches the model messages or the transcript', async () => {
  const { session, cleanup } = tempSession();
  try {
    const leaky = { run: () => `env dump:\nGITHUB_TOKEN=${SECRET}\nDONE` };
    const mock = createMockProvider([
      { text: '', toolCalls: [{ name: 'leak', args: {} }] },
      { text: 'read the env, done' },
    ]);
    const messages = [];
    const result = await runTurn({ provider: mock, session, tools: { leak: leaky }, messages, userInput: 'dump env' });
    assert.equal(result.status, 'done');

    // (1) the message fed back to the model is redacted
    const toolMsg = messages.find((m) => m.role === 'tool');
    assert.ok(!toolMsg.content.includes(SECRET), 'model must not receive the raw secret');
    assert.match(toolMsg.content, /\[REDACTED:R2\]/);

    // (2) the second model request never saw the secret
    const secondReq = JSON.stringify(mock.requests[1].messages);
    assert.ok(!secondReq.includes(SECRET));

    // (3) the persisted transcript is clean
    const raw = readFileSync(session.path, 'utf8');
    assert.ok(!raw.includes(SECRET), 'transcript leaked the secret');
    assert.match(raw, /\[REDACTED:R2\]/);
  } finally {
    cleanup();
  }
});

test('user-pasted secret in a task is redacted on persist', async () => {
  const { session, cleanup } = tempSession();
  try {
    const mock = createMockProvider([{ text: 'noted' }]);
    await runTurn({ provider: mock, session, tools: {}, messages: [], userInput: `my key is sk-${'q'.repeat(30)}` });
    const raw = readFileSync(session.path, 'utf8');
    assert.ok(!raw.includes('q'.repeat(30)));
    assert.match(raw, /\[REDACTED:R1\]/);
  } finally {
    cleanup();
  }
});

test('clean sessions are unaffected (no false redaction of ordinary events)', () => {
  const { session, cleanup } = tempSession();
  try {
    session.append('tool_result', { name: 'read', ok: true, output: 'const token = parseToken(x)' });
    const { events } = readSession(session.path);
    assert.equal(events[0].output, 'const token = parseToken(x)');
  } finally {
    cleanup();
  }
});
