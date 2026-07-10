import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, realpathSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail, classifyCommand, actionForCommand, isSecretPath, splitSegments } from '../src/permissions.js';
import { readSession, rebuildMessages, openSession, loadSession } from '../src/session.js';
import { preloadNamedFiles } from '../src/preload.js';
import { runTurn } from '../src/loop.js';
import { createMockProvider } from './helpers/mock-provider.js';

function jailFixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kaku-audit-')));
  writeFileSync(join(dir, 'notes.txt'), 'plain text');
  return { dir, jail: createJail(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// Finding 1: >&FILE is a redirect, not an fd-dup — must not classify read-only
test('F1: echo x >& file is a redirect (mutate), and >& system path is denied', () => {
  const { jail, cleanup } = jailFixture();
  try {
    const seg = splitSegments('echo x >& /some/file')[0];
    assert.equal(seg.hasRedirect, true, '>&FILE must set hasRedirect');
    assert.deepEqual(seg.redirectTargets, ['/some/file']);
    const cls = classifyCommand('echo pwned >& /etc/hosts', { jail });
    assert.equal(cls.class, 'deny', 'D7 must see the >& target');
    assert.equal(actionForCommand('echo x >& out.txt', 'readonly', { jail }).action, 'block');
  } finally {
    cleanup();
  }
});

test('F1 control: fd-dups still parse as read-only-compatible', () => {
  const { jail, cleanup } = jailFixture();
  try {
    const seg = splitSegments('grep -r foo src 2>&1')[0];
    assert.equal(seg.hasRedirect, false, '2>&1 is not a file redirect');
    assert.equal(classifyCommand('grep -r foo src 2>&1', { jail }).class, 'read-only');
  } finally {
    cleanup();
  }
});

// Finding 7: tab after > must not hide the target from D7
test('F7: tab-separated redirect target still hits D7', () => {
  const { jail, cleanup } = jailFixture();
  try {
    const cls = classifyCommand('echo payload >\t/usr/local/bin/x', { jail });
    assert.equal(cls.class, 'deny');
  } finally {
    cleanup();
  }
});

// Finding 4: read-only commands with out-of-jail path args must ask, not auto
test('F4: cat of an absolute out-of-jail path demotes to ask; in-jail stays auto', () => {
  const { dir, jail, cleanup } = jailFixture();
  try {
    assert.equal(classifyCommand('cat /etc/passwd', { jail }).class, 'ask');
    assert.equal(classifyCommand('head ~/.zsh_history', { jail }).class, 'ask');
    assert.equal(classifyCommand('cat $HOME/notes.txt', { jail }).class, 'ask');
    assert.equal(classifyCommand(`cat ${join(dir, 'notes.txt')}`, { jail }).class, 'read-only', 'absolute in-jail path stays read-only');
    assert.equal(classifyCommand('cat notes.txt', { jail }).class, 'read-only');
    assert.equal(classifyCommand('grep "rm -rf /" notes.txt', { jail }).class, 'read-only', 'quoted paths are data');
  } finally {
    cleanup();
  }
});

test('F4: shell history files are secret paths now', () => {
  assert.equal(isSecretPath('.zsh_history'), true);
  assert.equal(isSecretPath('/home/x/.bash_history'), true);
  assert.equal(isSecretPath('history.md'), false);
});

// Finding 2: crash-truncated trailing line must not hide or crash the session
test('F2: truncated trailing line is dropped; mid-file corruption still throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-audit-sess-'));
  try {
    const session = openSession({ dir, cwd: '/proj', model: 'm', tier: 'micro' });
    session.append('user_message', { content: 'hi' });
    session.append('assistant_message', { content: 'hello', toolCalls: [] });
    appendFileSync(session.path, '{"type":"assistant_mess');
    const { events } = readSession(session.path);
    assert.equal(events.length, 2, 'good events survive a truncated tail');
    const { messages } = loadSession(session.path);
    assert.equal(messages.length, 2);

    writeFileSync(session.path, '{"v":1}\n{broken\n{"type":"user_message","content":"x"}\n');
    assert.throws(() => readSession(session.path), /corrupt session line 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Finding 3: fenced-tier dangling tool_call must synthesize [interrupted]
test('F3: fenced-protocol crash between tool_call and tool_result → [interrupted] on rebuild', () => {
  const events = [
    { type: 'user_message', content: 'read a.txt' },
    { type: 'assistant_message', content: '```tool\n{"name":"read","args":{"path":"a.txt"}}\n```', toolCalls: [] },
    { type: 'tool_call', name: 'read', args: { path: 'a.txt' } },
  ];
  const messages = rebuildMessages(events);
  const last = messages.at(-1);
  assert.equal(last.role, 'tool');
  assert.equal(last.content, '[interrupted]');
});

test('F3 control: native-tier completed calls do not double-count', () => {
  const events = [
    { type: 'user_message', content: 'go' },
    { type: 'assistant_message', content: '', toolCalls: [{ name: 'read', args: {} }] },
    { type: 'tool_call', name: 'read', args: {} },
    { type: 'tool_result', name: 'read', ok: true, output: 'data' },
    { type: 'assistant_message', content: 'done', toolCalls: [] },
  ];
  const messages = rebuildMessages(events);
  assert.equal(messages.filter((m) => m.content === '[interrupted]').length, 0);
});

// Finding 0: empty final answer is not success
test('F0: empty final answer → one nudge, then empty_answer status (not done)', async () => {
  const provider = createMockProvider([{ text: '' }, { text: '' }]);
  const session = { append: () => {} };
  const res = await runTurn({ provider, session, tools: {}, messages: [], userInput: 'do it' });
  assert.equal(res.status, 'empty_answer');
});

test('F0: nudge rescues a model that answers on the second try', async () => {
  const provider = createMockProvider([{ text: '' }, { text: 'result: done, verified by test' }]);
  const session = { append: () => {} };
  const res = await runTurn({ provider, session, tools: {}, messages: [], userInput: 'do it' });
  assert.equal(res.status, 'done');
  assert.match(res.message.content, /verified/);
});

// Finding 8: preload must refuse symlink-to-secret (post-resolve check)
test('F8: preload refuses an innocently-named symlink pointing at a secret file', () => {
  const { dir, jail, cleanup } = jailFixture();
  try {
    writeFileSync(join(dir, '.env'), 'API_KEY=supersecretvalue123456\n');
    symlinkSync(join(dir, '.env'), join(dir, 'config.txt'));
    const out = preloadNamedFiles('summarize config.txt', { jail });
    assert.equal(out, '');
  } finally {
    cleanup();
  }
});
