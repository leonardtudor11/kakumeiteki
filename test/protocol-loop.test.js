import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createJail } from '../src/permissions.js';
import { createTools } from '../src/tools/index.js';
import { DEFAULTS } from '../src/config.js';
import { createMockProvider } from './helpers/mock-provider.js';

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'kaku-proto-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'app.js'), 'const x = 1;\n');
  const jail = createJail(root);
  const config = { ...DEFAULTS, permissions: 'auto' };
  const tools = createTools({ jail, config });
  const session = openSession({ dir: join(base, 's'), cwd: root, model: 'mock', tier: 'micro' });
  return { root, tools, session, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const types = (session) => readSession(session.path).events.map((e) => e.type);

test('fenced protocol drives the loop (no native tool calls)', async () => {
  const { root, tools, session, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: 'I will edit the file.\n```tool\n{"name": "edit", "args": {"path": "app.js", "old": "const x = 1;", "new": "const x = 2;"}}\n```' },
      { text: 'Done. Changed x to 2; the file now reads const x = 2.' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'set x to 2' });
    assert.equal(result.status, 'done');
    assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'const x = 2;\n');
    assert.deepEqual(types(session), ['user_message', 'assistant_message', 'tool_call', 'tool_result', 'assistant_message']);
  } finally {
    cleanup();
  }
});

test('gate: repair fires EXACTLY ONCE on garbage, then succeeds', async () => {
  const { root, tools, session, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: '```tool\n{"name": "edit", "args": {"path": "app.js", "old": "const x = 1;"\n```' },
      { text: '```tool\n{"name": "edit", "args": {"path": "app.js", "old": "const x = 1;", "new": "const x = 9;"}}\n```' },
      { text: 'Done — x is now 9.' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'set x to 9' });
    assert.equal(result.status, 'done');
    assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'const x = 9;\n');
    const t = types(session);
    assert.equal(t.filter((x) => x === 'repair').length, 1, 'repair must fire exactly once');
    assert.equal(t.filter((x) => x === 'protocol_failed').length, 0);
    assert.ok(t.includes('tool_result'));
  } finally {
    cleanup();
  }
});

test('gate: second consecutive garbage → clean protocol_failed, no infinite loop', async () => {
  const { session, tools, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: '```tool\n{"name": "edit" BROKEN\n```' },
      { text: '```tool\n{"name": "edit" STILL BROKEN\n```' },
      { text: 'should never be reached' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'protocol_failed');
    const t = types(session);
    assert.equal(t.filter((x) => x === 'repair').length, 1);
    assert.equal(t.filter((x) => x === 'protocol_failed').length, 1);
    assert.equal(mock.requests.length, 2, 'must stop after one repair attempt, not consume turn 3');
  } finally {
    cleanup();
  }
});

test('repair counter resets: garbage → repair → good tool call → later garbage repairs again', async () => {
  const { session, tools, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: '```tool\n{"name": "ls" BROKEN\n```' },
      { text: '```tool\n{"name": "ls", "args": {}}\n```' },
      { text: '```tool\n{"name": "grep" BROKEN AGAIN\n```' },
      { text: '```tool\n{"name": "grep", "args": {"pattern": "x"}}\n```' },
      { text: 'done' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    assert.equal(types(session).filter((x) => x === 'repair').length, 2, 'repair resets after a good turn');
  } finally {
    cleanup();
  }
});

test('unknown tool in a fenced call → repair guidance (not silent)', async () => {
  const { session, tools, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: '```tool\n{"name": "nuke", "args": {}}\n```' },
      { text: '```tool\n{"name": "ls", "args": {}}\n```' },
      { text: 'done' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'go' });
    assert.equal(result.status, 'done');
    const events = readSession(session.path).events;
    const repair = events.find((e) => e.type === 'repair');
    assert.match(repair.message, /unknown tool "nuke"/);
  } finally {
    cleanup();
  }
});

test('native tool-call path still works unchanged', async () => {
  const { root, tools, session, cleanup } = setup();
  try {
    const mock = createMockProvider([
      { text: '', toolCalls: [{ name: 'read', args: { path: 'app.js' } }] },
      { text: 'file has const x = 1' },
    ]);
    const result = await runTurn({ provider: mock, session, tools, messages: [], userInput: 'read it' });
    assert.equal(result.status, 'done');
    assert.deepEqual(types(session), ['user_message', 'assistant_message', 'tool_call', 'tool_result', 'assistant_message']);
    void root;
  } finally {
    cleanup();
  }
});
