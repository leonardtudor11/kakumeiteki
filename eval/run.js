import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSession } from '../src/session.js';
import { estimateTokens } from '../src/context.js';

export async function runTask(task, { config, makeAgent, now = () => Date.now() } = {}) {
  const base = mkdtempSync(join(tmpdir(), `kaku-eval-${task.id}-`));
  const dir = join(base, 'proj');
  mkdirSync(dir, { recursive: true });
  task.setup(dir);

  const t0 = now();
  let status = 'error';
  let errorMsg = null;
  let sessionPath = null;

  try {
    const taskConfig = { ...config, mode: task.mode ?? config.mode };
    const agent = await makeAgent(taskConfig, { cwd: dir, sessionDir: join(base, 'sessions') });
    sessionPath = agent.session.path;
    const res = await agent.run(task.task, { maxTurns: config.maxTurns });
    status = res.status;
  } catch (err) {
    errorMsg = err.message;
  }

  const seconds = +((now() - t0) / 1000).toFixed(1);
  const events = sessionPath ? readSession(sessionPath).events : [];
  const assistantMsgs = events.filter((e) => e.type === 'assistant_message');
  const turns = assistantMsgs.length;
  const toolCalls = events.filter((e) => e.type === 'tool_call').length;
  const tokens = assistantMsgs.reduce((s, e) => s + estimateTokens(e.content ?? ''), 0);
  const finalText = [...assistantMsgs].reverse().find((e) => (e.toolCalls ?? []).length === 0)?.content ?? '';

  let pass = false;
  let detail = errorMsg ?? 'run error';
  if (status !== 'error') {
    try {
      const c = task.check(dir, { finalText, events });
      pass = c.pass;
      detail = c.detail;
    } catch (err) {
      detail = `check threw: ${err.message}`;
    }
  }

  // Keep failed runs' workdir + session transcript — a regression you can't replay
  // can't be triaged (learned the hard way on 06-find-def).
  if (pass) rmSync(base, { recursive: true, force: true });
  return { id: task.id, name: task.name, pass, status, turns, toolCalls, tokens, seconds, detail, kept: pass ? null : sessionPath };
}

export async function runSuite(tasks, { config, runs = 1, makeAgent, now } = {}) {
  const results = [];
  for (let r = 1; r <= runs; r++) {
    for (const task of tasks) {
      results.push({ run: r, ...(await runTask(task, { config, makeAgent, now })) });
    }
  }
  return results;
}

export function renderScorecard(results, { model, generatedAt = 'unknown' } = {}) {
  const lines = [
    '# Eval scorecard',
    '',
    `Model: \`${model}\` · generated: ${generatedAt}`,
    '',
    '| run | task | pass | turns | tools | tokens | sec | detail |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    lines.push(`| ${r.run ?? 1} | ${r.id} | ${r.pass ? '✅' : '❌'} | ${r.turns} | ${r.toolCalls} | ${r.tokens} | ${r.seconds} | ${r.status === 'done' ? r.detail : r.status} |`);
  }
  const passed = results.filter((r) => r.pass).length;
  const avgSec = results.length ? (results.reduce((s, r) => s + r.seconds, 0) / results.length).toFixed(1) : '0';
  lines.push('', `**${passed}/${results.length} passed** · avg ${avgSec}s/task`, '');
  return lines.join('\n');
}

// The head table is "latest full run" and gets replaced; every section below the
// marker is measured history the runner must never touch. Learned the hard way:
// a full-matrix run once clobbered 185 lines of recorded baselines and A/Bs.
export const HISTORY_MARKER = '<!-- HISTORY — measured ground truth below; the runner replaces only the table above this line -->';

export function withPreservedHistory(prior, head) {
  const idx = (prior ?? '').indexOf(HISTORY_MARKER);
  const history = idx === -1 ? `${HISTORY_MARKER}\n` : prior.slice(idx);
  return `${head.trimEnd()}\n\n${history}`;
}
