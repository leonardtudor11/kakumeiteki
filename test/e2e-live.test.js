import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgent } from '../src/agent.js';
import { readSession } from '../src/session.js';
import { DEFAULTS } from '../src/config.js';

const LIVE = process.env.KAKU_LIVE === '1';
const MODEL = process.env.KAKU_MODEL ?? 'qwen3.5:4b';

const GREET_BEFORE = `export function greet(name) {
  return "Hello, " + name;
}
`;
const GREET_AFTER = `export function greet(name) {
  return "Hi, " + name;
}
`;

test('live e2e: model reads then edits a file byte-exact in <=10 turns', { skip: !LIVE && 'set KAKU_LIVE=1 to run (loads a real model)' }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'kaku-e2e-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'greet.js'), GREET_BEFORE);

  const config = { ...DEFAULTS, model: MODEL, permissions: 'auto', numCtx: 8192, maxTurns: 10 };

  try {
    let agent;
    try {
      agent = await createAgent(config, { cwd: root, sessionDir: join(base, 'sessions') });
    } catch (err) {
      if (err.name === 'EndpointError') return; // ollama not running — skip silently
      throw err;
    }

    const task = 'In greet.js, change the greeting word from "Hello" to "Hi". Change nothing else. Then stop.';
    const result = await agent.run(task, { onDelta: (d) => process.stdout.write(d) });
    process.stdout.write('\n');

    const events = readSession(agent.session.path).events;
    const turns = events.filter((e) => e.type === 'assistant_message').length;
    const final = readFileSync(join(root, 'greet.js'), 'utf8');

    console.log(`\n[e2e] status=${result.status} turns=${turns} toolCalls=${events.filter((e) => e.type === 'tool_call').length}`);
    console.log(`[e2e] final file:\n${final}`);

    assert.equal(result.status, 'done', `expected done, got ${result.status}`);
    assert.ok(turns <= 10, `used ${turns} turns`);
    assert.equal(final, GREET_AFTER, 'file must be byte-exact after edit');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
