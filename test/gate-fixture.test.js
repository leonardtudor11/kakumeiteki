import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSession } from '../src/session.js';
import { createAgent } from '../src/agent.js';
import { needsCompaction } from '../src/context.js';

function okJson(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
}

const fetchImpl = async (url) => {
  if (String(url).endsWith('/api/version')) return okJson({ version: 'fixture' });
  throw new Error(`unexpected fetch in fixture: ${url}`);
};

test('gate fixture: resuming an over-budget session compacts it on load', async () => {
  const proj = realpathSync(mkdtempSync(join(tmpdir(), 'kaku-gate-proj-')));
  const sessions = mkdtempSync(join(tmpdir(), 'kaku-gate-sessions-'));

  const session = openSession({ dir: sessions, cwd: proj, model: 'mock-model', tier: 'micro' });
  for (let i = 0; i < 10; i++) {
    session.append('user_message', { content: `question ${i} ` + 'x'.repeat(2000) });
    session.append('assistant_message', { content: `answer ${i} ` + 'y'.repeat(2000), toolCalls: [] });
  }

  const config = {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'mock-model',
    tier: 'micro',
    numCtx: 4096,
    mode: 'build',
    permissions: 'safe',
    maxTurns: 25,
    bash: { timeoutMs: 120000, maxOutputBytes: 65536 },
    sessionDir: sessions,
  };

  try {
    const agent = await createAgent(config, {
      cwd: proj,
      sessionDir: sessions,
      resume: true,
      providerOpts: { fetchImpl },
    });
    assert.equal(
      needsCompaction(agent.messages, agent.budget),
      false,
      'a resumed session must fit the context budget — over-budget requests get silently front-truncated by Ollama',
    );
    assert.equal(agent.messages[0].role, 'system', 'compaction on load must keep the system prompt first');
  } finally {
    rmSync(proj, { recursive: true, force: true });
    rmSync(sessions, { recursive: true, force: true });
  }
});
