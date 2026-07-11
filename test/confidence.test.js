import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLedger, recordTool, hasUncheckedChanges, verificationLine } from '../src/confidence.js';

function ledgerOf(...entries) {
  const ledger = createLedger();
  for (const e of entries) recordTool(ledger, e);
  return ledger;
}

test('read-only turn → no verification line, no nudge', () => {
  const ledger = ledgerOf(
    { name: 'read', args: { path: 'a.js' }, ok: true, output: '…' },
    { name: 'grep', args: { pattern: 'x' }, ok: true, output: '…' }
  );
  assert.equal(verificationLine(ledger), null);
  assert.equal(hasUncheckedChanges(ledger), false);
});

test('write + passing check → verified 1/1 with command and file named', () => {
  const ledger = ledgerOf(
    { name: 'write', args: { path: 'slugify.js' }, ok: true, output: 'wrote 100 bytes to slugify.js' },
    { name: 'bash', args: { command: 'node --test slugify.test.js' }, ok: true, output: '✔ all good' }
  );
  assert.equal(hasUncheckedChanges(ledger), false);
  assert.equal(verificationLine(ledger), 'verified 1/1 · node --test slugify.test.js → exit 0 · changed: slugify.js');
});

test('edit + failing check → check FAILED with exit code', () => {
  const ledger = ledgerOf(
    { name: 'edit', args: { path: 'sum.js' }, ok: true, output: 'edited' },
    { name: 'bash', args: { command: 'node --test sum.test.js' }, ok: true, output: '✖ fails\n[exit 1]' }
  );
  assert.equal(verificationLine(ledger), 'check FAILED 0/1 · node --test sum.test.js → exit 1 · changed: sum.js');
});

test('write with NO check → loud UNVERIFIED and nudge wanted', () => {
  const ledger = ledgerOf({ name: 'write', args: { path: 'slugify.js' }, ok: true, output: 'wrote' });
  assert.equal(hasUncheckedChanges(ledger), true);
  assert.equal(verificationLine(ledger), 'UNVERIFIED — no check ran · changed: slugify.js');
});

test('check BEFORE the last change does not count', () => {
  const ledger = ledgerOf(
    { name: 'edit', args: { path: 'a.js' }, ok: true, output: 'edited' },
    { name: 'bash', args: { command: 'node --test' }, ok: true, output: 'ok' },
    { name: 'edit', args: { path: 'a.js' }, ok: true, output: 'edited again' }
  );
  assert.equal(hasUncheckedChanges(ledger), true);
  assert.match(verificationLine(ledger), /^UNVERIFIED — last change came after the last check/);
});

test('trash alone is self-verifying — no nudge, honest line', () => {
  const ledger = ledgerOf({ name: 'trash', args: { paths: ['junk.tmp'] }, ok: true, output: 'trashed 1 file' });
  assert.equal(hasUncheckedChanges(ledger), false);
  assert.equal(verificationLine(ledger), 'self-verified · trash verified by tool output');
});

test('failed tool calls never reach the ledger', () => {
  const ledger = ledgerOf({ name: 'write', args: { path: 'x.js' }, ok: false, output: '[tool error] refused' });
  assert.equal(verificationLine(ledger), null);
});

test('echoed [exit N] mid-output cannot spoof the verdict — last marker wins', () => {
  const ledger = ledgerOf(
    { name: 'edit', args: { path: 'a.js' }, ok: true, output: 'edited' },
    { name: 'bash', args: { command: 'node check.js' }, ok: true, output: 'log says [exit 1] earlier\n[exit 3]' }
  );
  assert.equal(verificationLine(ledger), 'check FAILED 0/1 · node check.js → exit 3 · changed: a.js');
});

test('timeout and multi-check turns report the LAST outcome', () => {
  const ledger = ledgerOf(
    { name: 'write', args: { path: 'a.js' }, ok: true, output: 'wrote' },
    { name: 'bash', args: { command: 'node a.test.js' }, ok: true, output: '[timed out after 20000 ms — process killed. hint]' },
    { name: 'bash', args: { command: 'node --test a.test.js' }, ok: true, output: 'all pass' }
  );
  assert.equal(verificationLine(ledger), 'verified 1/2 · node --test a.test.js → exit 0 · changed: a.js');
});
