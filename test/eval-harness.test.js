import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runTask, runSuite, renderScorecard } from '../eval/run.js';
import { TASKS } from '../eval/tasks/index.js';
import { openSession } from '../src/session.js';

// A mock agent that logs a realistic event sequence and applies a deterministic "solution"
// to the fixture — exercises the runner (metrics, check, scorecard) without a live model.
function solverAgent(solve) {
  return async (config, { cwd, sessionDir }) => {
    const session = openSession({ dir: sessionDir, cwd, model: 'mock', tier: 'micro' });
    return {
      session,
      async run(task) {
        session.append('user_message', { content: task });
        session.append('assistant_message', { content: 'working on it', toolCalls: [{ name: 'ls', args: {} }] });
        session.append('tool_call', { name: 'ls', args: {} });
        session.append('tool_result', { name: 'ls', ok: true, output: 'files' });
        const finalText = solve(cwd) ?? 'done';
        session.append('assistant_message', { content: finalText, toolCalls: [] });
        return { status: 'done' };
      },
    };
  };
}

const config = { model: 'mock', mode: 'build', maxTurns: 10, numCtx: 8192, sessionDir: '/unused', permissions: 'auto' };
let clock = 0;
const now = () => (clock += 1500);

test('runTask: passing solution → pass=true with metrics', async () => {
  clock = 0;
  const makeAgent = solverAgent(() => 'The files are alpha.js and beta.js.');
  const result = await runTask(TASKS[0], { config, makeAgent, now });
  assert.equal(result.pass, true);
  assert.equal(result.status, 'done');
  assert.equal(result.turns, 2);
  assert.equal(result.toolCalls, 1);
  assert.ok(result.tokens > 0);
  assert.ok(result.seconds > 0);
  assert.equal(result.kept, null, 'passing runs are cleaned up');
});

test('runTask: wrong answer → pass=false, run still completes', async () => {
  clock = 0;
  const makeAgent = solverAgent(() => 'I could not determine the port.');
  const result = await runTask(TASKS[1], { config, makeAgent, now });
  assert.equal(result.pass, false);
  assert.equal(result.status, 'done');
  assert.match(result.detail, /finalText=/);
  assert.ok(result.kept && existsSync(result.kept), 'failed runs keep their transcript for triage');
  rmSync(join(result.kept, '..', '..'), { recursive: true, force: true }); // tidy the kept workdir after asserting
});

test('runTask: fix-test check runs the real fixture test (deterministic)', async () => {
  clock = 0;
  const fixSolver = solverAgent((cwd) => {
    writeFileSync(join(cwd, 'sum.js'), 'export function sum(a, b) {\n  return a + b;\n}\n');
    return 'Fixed the operator.';
  });
  const pass = await runTask(TASKS[2], { config, makeAgent: fixSolver, now });
  assert.equal(pass.pass, true, `expected pass, got: ${pass.detail}`);

  clock = 0;
  const noFix = solverAgent(() => 'left it broken');
  const fail = await runTask(TASKS[2], { config, makeAgent: noFix, now });
  assert.equal(fail.pass, false);
  assert.match(fail.detail, /test failed/);
});

test('runTask: an agent that throws → status error, pass false, no crash', async () => {
  clock = 0;
  const boom = async () => { throw new Error('preflight failed'); };
  const result = await runTask(TASKS[0], { config, makeAgent: boom, now });
  assert.equal(result.status, 'error');
  assert.equal(result.pass, false);
  assert.match(result.detail, /preflight failed/);
});

test('runSuite + renderScorecard: multi-run table with pass count and per-task rows', async () => {
  clock = 0;
  const makeAgent = solverAgent((cwd) => {
    if (cwd.includes('03-fix-test')) writeFileSync(join(cwd, 'sum.js'), 'export function sum(a, b) {\n  return a + b;\n}\n');
    return 'alpha.js and beta.js on port 8080';
  });
  const results = await runSuite(TASKS, { config, runs: 2, makeAgent, now });
  assert.equal(results.length, TASKS.length * 2);
  assert.ok(results.every((r) => r.run === 1 || r.run === 2));

  const md = renderScorecard(results, { model: 'mock', generatedAt: '2026-07-10' });
  assert.match(md, /# Eval scorecard/);
  assert.match(md, /Model: `mock`/);
  assert.match(md, /\| 01-hello-tool \|/);
  assert.match(md, new RegExp(`\\d+/${TASKS.length * 2} passed`));
  assert.match(md, /avg .*s\/task/);
});

test('withPreservedHistory: history below the marker survives a head rewrite', async () => {
  const { withPreservedHistory, HISTORY_MARKER } = await import('../eval/run.js');
  const prior = `old head\n\n${HISTORY_MARKER}\n## precious baseline\nmeasured numbers\n`;
  const out = withPreservedHistory(prior, 'new head\n');
  assert.ok(out.startsWith('new head\n'));
  assert.ok(out.includes(HISTORY_MARKER));
  assert.ok(out.includes('## precious baseline\nmeasured numbers'));
  assert.ok(!out.includes('old head'));
});

test('withPreservedHistory: no marker in prior → fresh marker, nothing lost silently', async () => {
  const { withPreservedHistory, HISTORY_MARKER } = await import('../eval/run.js');
  const out = withPreservedHistory('', 'head only');
  assert.equal(out, `head only\n\n${HISTORY_MARKER}\n`);
});
