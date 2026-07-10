import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { createDeltaRenderer } from '../src/ui.js';
import { runRepl } from '../src/cli.js';

function render(chunks) {
  let out = '';
  const r = createDeltaRenderer((s) => (out += s));
  for (const c of chunks) r.push(c);
  r.flush();
  return out;
}

test('renderer: prose streams through arbitrary chunking', () => {
  assert.equal(render(['Hel', 'lo wor', 'ld\nbye']), 'Hello world\nbye');
});

test('renderer: fenced block is suppressed entirely', () => {
  const text = 'Reading file.\n```tool\n{"name":"read","args":{}}\n```\nDone.\n';
  assert.equal(render([text]), 'Reading file.\nDone.\n');
});

test('renderer: fence split across chunks is still caught', () => {
  assert.equal(render(['`', '`', '`json\n{"x"', ':1}\n``', '`\nok\n']), 'ok\n');
});

test('renderer: backticks mid-line are not a fence', () => {
  assert.equal(render(['use ``` for fences\n']), 'use ``` for fences\n');
});

test('renderer: indented fence line counts', () => {
  assert.equal(render(['  ```tool\n{"a":1}\n  ```\nhi\n']), 'hi\n');
});

test('renderer: blank lines inside fence stay hidden, outside pass', () => {
  assert.equal(render(['a\n\n```t\nx\n\ny\n```\nb\n']), 'a\n\nb\n');
});

function collect() {
  let s = '';
  return { write: (t) => (s += t), get: () => s };
}

function startRepl(agent, { confirmRef } = {}) {
  const input = new PassThrough();
  const out = collect();
  const err = collect();
  const done = runRepl(agent, {
    input,
    output: { write: out.write },
    errput: { write: err.write },
    ...(confirmRef ? { confirmRef } : {}),
  });
  return { input, out, err, done };
}

test('repl: task round-trip then exit', async () => {
  const agent = {
    run: async (task, { onDelta }) => {
      onDelta(`did: ${task}\n`);
      return { status: 'done' };
    },
  };
  const { input, out, done } = startRepl(agent);
  input.write('build it\n');
  await sleep(20);
  input.write('exit\n');
  assert.equal(await done, 0);
  assert.match(out.get(), /did: build it/);
});

test('repl: non-done status printed to errput', async () => {
  const agent = { run: async () => ({ status: 'turn_cap' }) };
  const { input, err, done } = startRepl(agent);
  input.write('go\n');
  await sleep(20);
  input.write('exit\n');
  await done;
  assert.match(err.get(), /\[turn_cap\]/);
});

test('repl: SIGINT mid-turn cancels, repl stays alive', async () => {
  const agent = {
    run: (task, { signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      }),
  };
  const { input, err, done } = startRepl(agent);
  input.write('long task\n');
  await sleep(20);
  process.emit('SIGINT');
  await sleep(20);
  assert.match(err.get(), /\[cancelled\]/);
  input.write('exit\n');
  assert.equal(await done, 0);
});

test('repl: double SIGINT mid-turn exits after cancel', async () => {
  const agent = {
    run: (task, { signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      }),
  };
  const { input, done } = startRepl(agent);
  input.write('long task\n');
  await sleep(20);
  process.emit('SIGINT');
  process.emit('SIGINT');
  assert.equal(await done, 0);
});

test('repl: SIGINT at idle prompt exits 0', async () => {
  const agent = { run: async () => ({ status: 'done' }) };
  const { done } = startRepl(agent);
  await sleep(20);
  process.emit('SIGINT');
  assert.equal(await done, 0);
});

test('repl: confirm y approves, n denies', async () => {
  const confirmRef = { fn: null };
  const answers = [];
  const agent = {
    run: async () => {
      answers.push(await confirmRef.fn({ command: 'rm x', class: 'mutate' }));
      return { status: 'done' };
    },
  };
  const { input, out, done } = startRepl(agent, { confirmRef });
  input.write('task one\n');
  await sleep(20);
  input.write('y\n');
  await sleep(20);
  input.write('task two\n');
  await sleep(20);
  input.write('n\n');
  await sleep(20);
  input.write('exit\n');
  assert.equal(await done, 0);
  assert.deepEqual(answers, [true, false]);
  assert.match(out.get(), /allow mutate command: rm x/);
});

test('repl: confirmRef cleared after exit', async () => {
  const confirmRef = { fn: null };
  const agent = { run: async () => ({ status: 'done' }) };
  const { input, done } = startRepl(agent, { confirmRef });
  await sleep(20);
  assert.equal(typeof confirmRef.fn, 'function');
  input.write('exit\n');
  await done;
  assert.equal(confirmRef.fn, null);
});
