import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { runReplInteractive } from '../src/tui.js';

// Mock TTY streams: enough surface for the raw-mode editor without a real terminal.
function mockInput() {
  const input = new EventEmitter();
  input.rawMode = null;
  input.paused = false;
  input.setRawMode = (v) => { input.rawMode = v; };
  input.pause = () => { input.paused = true; };
  return input;
}

function mockOutput() {
  const output = new EventEmitter();
  output.columns = 80;
  output.writes = '';
  output.write = (s) => { output.writes += s; return true; };
  return output;
}

const idleAgent = { mode: 'build', messages: [], budget: {}, run: async () => ({ status: 'done' }), session: { path: '/nowhere' } };

function type(input, text) {
  for (const ch of text) input.emit('keypress', ch, { name: ch, sequence: ch });
}

test('editor releases stdin on exit — process would hang otherwise', async () => {
  const input = mockInput();
  const output = mockOutput();
  const done = runReplInteractive(idleAgent, { input, output, errput: mockOutput() });
  await new Promise((r) => setImmediate(r));
  assert.equal(input.rawMode, true, 'raw mode on while editing');
  type(input, 'exit');
  input.emit('keypress', '\r', { name: 'return' });
  const code = await done;
  assert.equal(code, 0);
  assert.equal(input.rawMode, false, 'raw mode restored');
  assert.equal(input.paused, true, 'stdin paused so the event loop can drain (v1.1 hang regression)');
});

test('editor exits on Ctrl-C with an empty line, and on Ctrl-D', async () => {
  for (const key of [{ name: 'c', ctrl: true }, { name: 'd', ctrl: true }]) {
    const input = mockInput();
    const done = runReplInteractive(idleAgent, { input, output: mockOutput(), errput: mockOutput() });
    await new Promise((r) => setImmediate(r));
    input.emit('keypress', undefined, key);
    assert.equal(await done, 0, `${key.name}: clean exit`);
    assert.equal(input.paused, true, `${key.name}: stdin released`);
  }
});

test('editor runs a task through the agent and returns to the prompt', async () => {
  const input = mockInput();
  const output = mockOutput();
  const ran = [];
  const agent = { ...idleAgent, run: async (task) => { ran.push(task); return { status: 'done' }; } };
  const done = runReplInteractive(agent, { input, output, errput: mockOutput() });
  await new Promise((r) => setImmediate(r));
  type(input, 'hello');
  input.emit('keypress', '\r', { name: 'return' });
  await new Promise((r) => setImmediate(r));
  type(input, 'exit');
  input.emit('keypress', '\r', { name: 'return' });
  assert.equal(await done, 0);
  assert.deepEqual(ran, ['hello'], 'task reached the agent exactly once');
});
