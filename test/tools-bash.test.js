import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail, classifyCommand } from '../src/permissions.js';
import { createTools } from '../src/tools/index.js';
import { DEFAULTS } from '../src/config.js';
import { runTurn } from '../src/loop.js';
import { openSession, readSession } from '../src/session.js';
import { createMockProvider } from './helpers/mock-provider.js';

function setup({ permissions = 'auto', timeoutMs = 5000, maxOutputBytes = 65536, confirm } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'kaku-bash-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  const jail = createJail(root);
  const config = { ...DEFAULTS, permissions, bash: { timeoutMs, maxOutputBytes } };
  const tools = createTools({ jail, config, confirm });
  return { root: jail.root, tools, jail, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('bash: read-only command runs without confirm, returns output', async () => {
  const { tools, cleanup } = setup({ permissions: 'safe' });
  try {
    assert.equal(await tools.bash.run({ command: 'echo hello' }), 'hello');
  } finally {
    cleanup();
  }
});

test('bash: cwd pinned to jail root', async () => {
  const { root, tools, cleanup } = setup();
  try {
    assert.equal(await tools.bash.run({ command: 'pwd' }), root);
  } finally {
    cleanup();
  }
});

test('bash: nonzero exit surfaces exit code with stderr', async () => {
  const { tools, cleanup } = setup();
  try {
    const out = await tools.bash.run({ command: 'ls definitely-not-here' });
    assert.match(out, /definitely-not-here/);
    assert.match(out, /\[exit \d+\]/);
  } finally {
    cleanup();
  }
});

test('bash: denied command throws, confirm never consulted', async () => {
  let confirmCalls = 0;
  const { tools, cleanup } = setup({ confirm: async () => { confirmCalls++; return true; } });
  try {
    await assert.rejects(tools.bash.run({ command: 'sudo whoami' }), /command blocked.*D1/);
    assert.equal(confirmCalls, 0);
  } finally {
    cleanup();
  }
});

test('bash: ask flow — approved runs, declined does not execute', async () => {
  let asked;
  const approve = setup({ permissions: 'safe', confirm: async (req) => { asked = req; return true; } });
  try {
    await approve.tools.bash.run({ command: 'touch created.txt' });
    assert.ok(existsSync(join(approve.root, 'created.txt')));
    assert.equal(asked.class, 'mutate');
    assert.match(asked.command, /touch/);
  } finally {
    approve.cleanup();
  }

  const decline = setup({ permissions: 'safe', confirm: async () => false });
  try {
    await assert.rejects(decline.tools.bash.run({ command: 'touch nope.txt' }), /declined/);
    assert.equal(existsSync(join(decline.root, 'nope.txt')), false);
  } finally {
    decline.cleanup();
  }
});

test('bash: no confirm callback → ask-class refused (safe default)', async () => {
  const { tools, root, cleanup } = setup({ permissions: 'safe' });
  try {
    await assert.rejects(tools.bash.run({ command: 'touch ghost.txt' }), /declined/);
    assert.equal(existsSync(join(root, 'ghost.txt')), false);
  } finally {
    cleanup();
  }
});

test('bash: readonly mode blocks mutate outright', async () => {
  const { tools, cleanup } = setup({ permissions: 'readonly', confirm: async () => true });
  try {
    await assert.rejects(tools.bash.run({ command: 'touch x' }), /blocked/);
  } finally {
    cleanup();
  }
});

test('bash: timeout kills process and reports honestly', async () => {
  const { tools, cleanup } = setup({ timeoutMs: 300 });
  try {
    const out = await tools.bash.run({ command: 'sleep 5' });
    assert.match(out, /timed out after 300 ms/);
  } finally {
    cleanup();
  }
});

test('bash: output cap truncates and kills', async () => {
  const { tools, cleanup } = setup({ maxOutputBytes: 1000 });
  try {
    const out = await tools.bash.run({ command: 'seq 1 100000' });
    assert.match(out, /output truncated at 1000 bytes/);
    assert.ok(out.length < 1200);
  } finally {
    cleanup();
  }
});

test('bash: parent env secrets never reach the child', async () => {
  process.env.KAKU_TEST_SECRET = 'super-sensitive-value';
  const { tools, cleanup } = setup();
  try {
    const out = await tools.bash.run({ command: 'printenv' });
    assert.ok(!out.includes('super-sensitive-value'));
    assert.match(out, /PATH=/);
  } finally {
    delete process.env.KAKU_TEST_SECRET;
    cleanup();
  }
});

test('bash: abort mid-command rejects AbortError; loop writes cancelled', async () => {
  const base = mkdtempSync(join(tmpdir(), 'kaku-bash-loop-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  try {
    const jail = createJail(root);
    const config = { ...DEFAULTS, permissions: 'auto', bash: { timeoutMs: 5000, maxOutputBytes: 65536 } };
    const tools = createTools({ jail, config });
    const session = openSession({ dir: join(base, 'sessions'), cwd: root, model: 'mock', tier: 'micro' });
    const mock = createMockProvider([
      { text: '', toolCalls: [{ name: 'bash', args: { command: 'sleep 5' } }] },
    ]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = await runTurn({
      provider: mock,
      session,
      tools,
      messages: [],
      userInput: 'run it',
      signal: controller.signal,
    });
    assert.equal(result.status, 'cancelled');
    const { events } = readSession(session.path);
    assert.deepEqual(events.map((e) => e.type), ['user_message', 'assistant_message', 'tool_call', 'cancelled']);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('classifier: bash args touching secret files → ask floor (read-tool bypass closed)', () => {
  const base = mkdtempSync(join(tmpdir(), 'kaku-secret-args-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  const jail = createJail(root);
  try {
    for (const command of ['cat .env', 'grep TOKEN .env', 'cat config/.env', 'ls ../.ssh', 'head -1 id_rsa']) {
      assert.equal(classifyCommand(command, { jail }).class, 'ask', command);
    }
    assert.equal(classifyCommand('cat .env.example', { jail }).class, 'read-only');
    assert.equal(classifyCommand('cat env.js', { jail }).class, 'read-only');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
