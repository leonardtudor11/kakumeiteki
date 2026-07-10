import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSkillTool, listSkills } from '../src/tools/skill.js';
import { createTools } from '../src/tools/index.js';
import { createJail } from '../src/permissions.js';
import { buildSystemPrompt } from '../src/prompt.js';

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

test('listSkills: finds the shipped playbooks', () => {
  const names = listSkills();
  for (const expected of ['auth', 'payments', 'resilience', 'scalability', 'rag', 'secrets-ops', 'observability', 'operations', 'security']) {
    assert.ok(names.includes(expected), `missing playbook: ${expected}`);
  }
});

test('skill tool: reads a playbook by name', () => {
  const tool = createSkillTool();
  const out = tool.run({ name: 'payments' });
  assert.match(out, /integer minor units/);
  assert.match(out, /webhook/i);
});

test('skill tool: unknown name and traversal shapes rejected', () => {
  const tool = createSkillTool();
  assert.throws(() => tool.run({ name: 'nope' }), /unknown playbook/);
  assert.throws(() => tool.run({ name: '../PLAN' }), /unknown playbook/);
  assert.throws(() => tool.run({ name: 'auth/../../package' }), /unknown playbook/);
  assert.throws(() => tool.run({}), /unknown playbook/);
});

test('skill tool: registered in the tool set and listed in the system prompt', () => {
  const jail = createJail(process.cwd());
  const tools = createTools({ jail });
  assert.ok(tools.skill, 'skill tool registered');
  const prompt = buildSystemPrompt({ tier: 'micro', mode: 'build', tools: Object.values(tools), cwd: '/proj' });
  assert.match(prompt, /skill:/);
  assert.match(prompt, /payments/);
});

test('playbooks lint: every skills/*.md is non-trivial and cites sources', () => {
  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 9);
  const doctrine = ['auth.md', 'payments.md', 'resilience.md', 'scalability.md', 'rag.md', 'secrets-ops.md', 'observability.md', 'operations.md', 'security.md'];
  for (const f of doctrine) {
    const text = readFileSync(join(SKILLS_DIR, f), 'utf8');
    assert.ok(text.length > 800, `${f} too thin`);
    assert.match(text, /## Sources/, `${f} missing Sources section`);
  }
});
