import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSuite, renderScorecard } from './run.js';
import { TASKS } from './tasks/index.js';
import { createAgent } from '../src/agent.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['qwen3.5:4b', 'qwen2.5-coder:3b'];
const RUNS = Number(process.env.RUNS ?? 2);

// TASK_FILTER=11,12 runs only matching task-id prefixes and SKIPS all file writes —
// partial runs print to stderr only, so they can never clobber the full-matrix
// scorecard.md with a subset table.
const FILTER = process.env.TASK_FILTER?.split(',').map((s) => s.trim()).filter(Boolean);
const RUN_TASKS = FILTER ? TASKS.filter((t) => FILTER.some((f) => t.id.startsWith(f))) : TASKS;
if (FILTER && !RUN_TASKS.length) {
  process.stderr.write(`TASK_FILTER "${process.env.TASK_FILTER}" matches no tasks\n`);
  process.exit(1);
}

function configFor(model) {
  return {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model,
    mode: 'build',
    tier: 'micro',
    maxTurns: 12,
    numCtx: 8192,
    permissions: 'auto',
    sessionDir: '/tmp/kaku-eval-sessions',
    bash: { timeoutMs: 20000, maxOutputBytes: 65536 },
  };
}

function summarize(results, id) {
  const rs = results.filter((r) => r.id === id);
  const passes = rs.filter((r) => r.pass).length;
  const avg = (k) => (rs.length ? rs.reduce((s, r) => s + (r[k] ?? 0), 0) / rs.length : 0);
  return { passRate: `${passes}/${rs.length}`, passes, total: rs.length, turns: avg('turns').toFixed(1), sec: avg('seconds').toFixed(1) };
}

const all = {};
for (const model of MODELS) {
  process.stderr.write(`\n=== ${model} — ${RUNS} runs x ${RUN_TASKS.length} tasks${FILTER ? ' (filtered — no files written)' : ''} ===\n`);
  const t0 = Date.now();
  const results = await runSuite(RUN_TASKS, { config: configFor(model), runs: RUNS, makeAgent: (c, o) => createAgent(c, o) });
  if (!FILTER) {
    const safe = model.replace(/[^a-z0-9]+/gi, '-');
    writeFileSync(join(__dir, `scorecard-${safe}.md`), renderScorecard(results, { model, generatedAt: 'full-matrix' }));
  }
  all[model] = results;
  const passed = results.filter((r) => r.pass).length;
  process.stderr.write(`${model}: ${passed}/${results.length} passed in ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
  for (const r of results.filter((x) => x.kept)) process.stderr.write(`  kept transcript: ${r.id} run ${r.run} -> ${r.kept}\n`);
}

const lines = ['# Eval scorecard — model comparison', '', `Models: ${MODELS.join(' vs ')} · ${RUNS} runs/task`, ''];
lines.push(`| task | ${MODELS.map((m) => `${m} pass`).join(' | ')} | ${MODELS.map((m) => `${m} turns`).join(' | ')} | ${MODELS.map((m) => `${m} sec`).join(' | ')} |`);
lines.push(`|---|${MODELS.map(() => '---').join('|')}|${MODELS.map(() => '---').join('|')}|${MODELS.map(() => '---').join('|')}|`);
for (const task of RUN_TASKS) {
  const s = MODELS.map((m) => summarize(all[m], task.id));
  lines.push(`| ${task.id} | ${s.map((x) => x.passRate).join(' | ')} | ${s.map((x) => x.turns).join(' | ')} | ${s.map((x) => x.sec).join(' | ')} |`);
}
const totals = MODELS.map((m) => {
  const passed = all[m].filter((r) => r.pass).length;
  const avgSec = (all[m].reduce((s, r) => s + r.seconds, 0) / all[m].length).toFixed(1);
  return { model: m, line: `**${passed}/${all[m].length}** (avg ${avgSec}s)` };
});
lines.push('', '## Totals', '', ...totals.map((t) => `- \`${t.model}\`: ${t.line}`), '');

const comparison = lines.join('\n');
if (!FILTER) writeFileSync(join(__dir, 'scorecard.md'), comparison);
process.stderr.write('\n' + comparison + '\n');
