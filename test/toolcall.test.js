import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseToolCalls } from '../src/toolcall.js';
import { buildSystemPrompt } from '../src/prompt.js';

const NAMES = ['read', 'write', 'edit', 'ls', 'glob', 'grep', 'bash'];
const parse = (text) => parseToolCalls(text, { toolNames: NAMES });

test('parses a well-formed ```tool block', () => {
  const { calls, repair } = parse('Reading the file.\n```tool\n{"name": "read", "args": {"path": "src/app.js"}}\n```');
  assert.equal(repair, null);
  assert.deepEqual(calls, [{ name: 'read', args: { path: 'src/app.js' } }]);
});

test('accepts ```json fence and normalizes tool/arguments keys', () => {
  const { calls } = parse('```json\n{"tool": "edit", "arguments": {"path": "a.js", "old": "x", "new": "y"}}\n```');
  assert.deepEqual(calls, [{ name: 'edit', args: { path: 'a.js', old: 'x', new: 'y' } }]);
});

test('accepts bare JSON object with no fence', () => {
  const { calls } = parse('{"name": "ls", "args": {"path": "src"}}');
  assert.deepEqual(calls, [{ name: 'ls', args: { path: 'src' } }]);
});

test('args as a JSON string get coerced to an object', () => {
  const { calls } = parse('```tool\n{"name": "grep", "args": "{\\"pattern\\": \\"TODO\\"}"}\n```');
  assert.deepEqual(calls, [{ name: 'grep', args: { pattern: 'TODO' } }]);
});

test('inlined args (no args key) collected as the remaining fields', () => {
  const { calls } = parse('```tool\n{"name": "read", "path": "x.js", "limit": 20}\n```');
  assert.deepEqual(calls, [{ name: 'read', args: { path: 'x.js', limit: 20 } }]);
});

test('plain final answer (no tool block) → no calls, no repair', () => {
  const { calls, repair } = parse('Done. Renamed getData to fetchData on line 1; verified the two call sites are untouched.');
  assert.deepEqual(calls, []);
  assert.equal(repair, null);
});

test('malformed JSON in a tool fence → repair signal, not a throw', () => {
  const { calls, repair } = parse('```tool\n{"name": "read", "args": {"path": "x.js"\n```');
  assert.deepEqual(calls, []);
  assert.match(repair, /not valid JSON/);
  assert.match(repair, /```tool/);
});

test('unknown tool name → repair naming available tools', () => {
  const { repair } = parse('```tool\n{"name": "delete_everything", "args": {}}\n```');
  assert.match(repair, /unknown tool "delete_everything"/);
  assert.match(repair, /read, write, edit/);
});

test('tool shape missing name → repair guidance', () => {
  const { repair } = parse('```tool\n{"args": {"path": "x"}}\n```');
  assert.match(repair, /missing a recognizable/);
});

test('prose that merely mentions JSON does not false-trigger', () => {
  const { calls, repair } = parse('I will use the read tool with a path argument next.');
  assert.deepEqual(calls, []);
  assert.equal(repair, null);
});

test('bogus JSON without tool shape is ignored, not repaired', () => {
  const { calls, repair } = parse('```json\n{"unrelated": true}\n```');
  assert.deepEqual(calls, []);
  assert.equal(repair, null);
});

test('array of tool calls in one block', () => {
  const { calls } = parse('```tool\n[{"name": "ls", "args": {}}, {"name": "read", "args": {"path": "a"}}]\n```');
  assert.deepEqual(calls, [
    { name: 'ls', args: {} },
    { name: 'read', args: { path: 'a' } },
  ]);
});

test('without toolNames, unknown-name check is skipped (parser reusable)', () => {
  const { calls, repair } = parseToolCalls('```tool\n{"name": "anything", "args": {}}\n```', {});
  assert.equal(repair, null);
  assert.deepEqual(calls, [{ name: 'anything', args: {} }]);
});

const FAKE_TOOLS = NAMES.map((name) => ({
  name,
  schema: { function: { name, description: `${name} description` } },
}));

test('prompt round-trip: micro fence example parses back to a valid call', () => {
  const prompt = buildSystemPrompt({ tier: 'micro', mode: 'build', tools: FAKE_TOOLS, cwd: '/proj' });
  const fence = prompt.match(/```tool\n([\s\S]*?)```/);
  assert.ok(fence, 'micro prompt must contain a ```tool example');
  const { calls, repair } = parse('```tool\n' + fence[1] + '```');
  assert.equal(repair, null);
  assert.equal(calls.length, 1);
  assert.ok(NAMES.includes(calls[0].name));
});

test('prompt: micro is compact and lists every tool', () => {
  const prompt = buildSystemPrompt({ tier: 'micro', tools: FAKE_TOOLS, cwd: '/proj' });
  assert.ok(prompt.length < 1400, `micro prompt too long: ${prompt.length}`);
  for (const name of NAMES) assert.match(prompt, new RegExp(`\\b${name}\\b`));
  assert.match(prompt, /exact/i);
  assert.match(prompt, /Read before/i);
});

test('prompt: audit and plan modes forbid modification, full tier lists the laws', () => {
  const audit = buildSystemPrompt({ tier: 'standard', mode: 'audit', tools: FAKE_TOOLS });
  assert.match(audit, /do NOT modify/i);
  assert.match(audit, /self-audit/i);
  const plan = buildSystemPrompt({ tier: 'standard', mode: 'plan', tools: FAKE_TOOLS });
  assert.match(plan, /options with tradeoffs/i);
  assert.match(plan, /do NOT modify/i);
});
