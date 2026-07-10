import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTurn } from '../src/loop.js';
import { openSession, reopenSession, readSession, loadSession } from '../src/session.js';
import { budgetFor, countMessages, needsCompaction, compact } from '../src/context.js';
import { createMockProvider } from './helpers/mock-provider.js';

const SECRET = 'ORCHID-42';
const flatten = (messages) => messages.map((m) => `${m.content ?? ''} ${JSON.stringify(m.toolCalls ?? '')}`).join('\n');

// A tool that returns a large payload so context grows fast and forces compaction.
const bigRead = { run: ({ path }) => `FILE ${path}:\n${'x'.repeat(500)}` };

test('Phase 4 gate: 30-turn session — budget held, compaction fired, state carried, resume continues', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-gate4-'));
  mkdirSync(dir, { recursive: true });
  try {
    const budget = budgetFor(2048, { reserve: 0, compactRatio: 0.8 });

    // 29 distinct tool calls (distinct paths avoid the doom-loop guard) then a final answer = 30 turns.
    const turns = [];
    for (let i = 0; i < 29; i++) {
      turns.push({ text: '', toolCalls: [{ name: 'read', args: { path: `module-${i}.js` } }] });
    }
    turns.push({ text: 'Inspected all modules. Done.' });
    const mock = createMockProvider(turns);

    const session = openSession({ dir, cwd: '/proj', model: 'mock', tier: 'micro' });
    const messages = [{ role: 'system', content: 'You are a coding agent.' }];
    const task = `Remember this for later: the deploy key is ${SECRET}. Now inspect all 30 modules one at a time.`;

    const result = await runTurn({
      provider: mock,
      session,
      tools: { read: bigRead },
      messages,
      userInput: task,
      maxTurns: 30,
      budget,
    });

    // (1) completed within the turn cap
    assert.equal(result.status, 'done', `status ${result.status}`);
    assert.ok(mock.requests.length >= 20, `expected a long session, got ${mock.requests.length} requests`);

    // (2) EVERY request stayed within the hard input budget (asserted from the request log)
    const sizes = mock.requests.map((r) => countMessages(r.messages));
    const over = sizes.filter((s) => s > budget.input);
    assert.equal(over.length, 0, `every request must be <= ${budget.input}; over: ${over}`);

    // (3) at least one compaction fired, and it actually shrank the context
    const events = readSession(session.path).events;
    const compactions = events.filter((e) => e.type === 'compaction');
    assert.ok(compactions.length >= 1, 'expected >= 1 compaction');
    assert.ok(compactions.every((c) => c.after < c.before), 'each compaction must reduce tokens');

    // (4) state-carry: the secret from the original task survives in the context after compaction
    const lastRequest = mock.requests.at(-1).messages;
    assert.match(flatten(lastRequest), new RegExp(SECRET), 'open-task fact must survive compaction');

    // (5) resume: rebuild from the full transcript, continue the session, secret still available
    const { messages: history } = loadSession(session.path);
    let resumed = [{ role: 'system', content: 'You are a coding agent.' }, ...history];
    if (needsCompaction(resumed, budget)) resumed = compact(resumed, budget).messages;

    const session2 = reopenSession(session.path);
    const mock2 = createMockProvider([{ text: `The deploy key is ${SECRET}.` }]);
    const r2 = await runTurn({
      provider: mock2,
      session: session2,
      tools: { read: bigRead },
      messages: resumed,
      userInput: 'What was the deploy key I gave you earlier?',
      maxTurns: 3,
      budget,
    });

    assert.equal(r2.status, 'done');
    assert.match(flatten(mock2.requests[0].messages), new RegExp(SECRET), 'resumed context must carry the original fact');
    // the reopened transcript keeps growing on the same file
    const finalEvents = readSession(session.path).events;
    assert.ok(finalEvents.filter((e) => e.type === 'user_message').length >= 2, 'resume appended a new user turn to the same session');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
