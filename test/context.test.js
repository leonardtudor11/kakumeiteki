import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimateTokens, countMessage, countMessages, budgetFor, needsCompaction } from '../src/context.js';

test('estimateTokens: zero for empty, conservative (>= chars/4) otherwise', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(undefined), 0);
  const text = 'a'.repeat(400);
  assert.ok(estimateTokens(text) >= 400 / 4, 'must not under-count vs the standard chars/4 rule');
  assert.equal(estimateTokens(text), Math.ceil(400 / 3.5));
});

test('countMessage: content + overhead + toolCalls + name', () => {
  const plain = countMessage({ role: 'user', content: 'hello' });
  assert.equal(plain, 4 + estimateTokens('hello'));

  const withCalls = countMessage({ role: 'assistant', content: '', toolCalls: [{ name: 'read', args: { path: 'x.js' } }] });
  assert.ok(withCalls > 4, 'tool calls add tokens');

  const toolResult = countMessage({ role: 'tool', name: 'read', content: 'file body' });
  assert.equal(toolResult, 4 + estimateTokens('file body') + estimateTokens('read'));
});

test('countMessages: sums across the array', () => {
  const messages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'yo' },
  ];
  assert.equal(countMessages(messages), messages.reduce((s, m) => s + countMessage(m), 0));
  assert.equal(countMessages([]), 0);
});

test('budgetFor: reserves response headroom and sets 80% compact threshold', () => {
  const b = budgetFor(8192);
  assert.equal(b.numCtx, 8192);
  assert.equal(b.input, 8192 - 1024);
  assert.equal(b.compactAt, Math.floor((8192 - 1024) * 0.8));
  assert.ok(b.compactAt < b.input);
});

test('budgetFor: custom reserve/ratio; tiny ctx never goes negative', () => {
  const b = budgetFor(4096, { reserve: 512, compactRatio: 0.5 });
  assert.equal(b.input, 4096 - 512);
  assert.equal(b.compactAt, Math.floor((4096 - 512) * 0.5));
  assert.equal(budgetFor(256, { reserve: 1024 }).input, 0);
});

test('needsCompaction: true only past the threshold', () => {
  const budget = budgetFor(1024, { reserve: 0, compactRatio: 0.8 }); // compactAt ~819
  const small = [{ role: 'user', content: 'x'.repeat(100) }];
  assert.equal(needsCompaction(small, budget), false);

  const big = [{ role: 'user', content: 'x'.repeat(4000) }]; // ~1143 tokens > 819
  assert.equal(needsCompaction(big, budget), true);
});
