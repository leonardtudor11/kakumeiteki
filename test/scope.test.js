import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { scopeConsent } from '../src/permissions.js';
import { parseArgv, consentScope } from '../src/cli.js';

test('scopeConsent policy: / refused; home and outside-home confirm; home subdir ok', () => {
  const home = '/Users/someone';
  assert.equal(scopeConsent('/', { home }).level, 'refuse');
  assert.equal(scopeConsent(home, { home }).level, 'confirm');
  assert.equal(scopeConsent('/Volumes/data', { home }).level, 'confirm');
  assert.equal(scopeConsent('/etc', { home }).level, 'confirm');
  assert.equal(scopeConsent(join(home, 'Downloads'), { home }).level, 'ok');
  // prefix trap: /Users/someone-else must NOT count as inside /Users/someone
  assert.equal(scopeConsent('/Users/someone-else/x', { home }).level, 'confirm');
});

test('parseArgv: --scope captures the directory; missing value throws', () => {
  assert.equal(parseArgv(['--scope', '~/Downloads']).scope, '~/Downloads');
  assert.equal(parseArgv(['undo', '--scope', '/tmp/x']).command, 'undo');
  assert.throws(() => parseArgv(['--scope']), /--scope requires a directory/);
});

test('consentScope: nonexistent and non-directory scopes are clean errors', async () => {
  await assert.rejects(() => consentScope('/no/such/dir-xyz'), /no such directory/);
  const dir = mkdtempSync(join(tmpdir(), 'kaku-scope-'));
  writeFileSync(join(dir, 'file.txt'), 'x');
  await assert.rejects(() => consentScope(join(dir, 'file.txt')), /not a directory/);
});

test('consentScope: ok-level resolves to the realpath without asking', async () => {
  // a subdir of the real home is level ok — no TTY needed
  const sub = mkdtempSync(join(homedir(), '.kaku-scope-test-'));
  try {
    const real = await consentScope(sub, { input: new PassThrough(), output: new PassThrough() });
    assert.equal(real, realpathSync(sub));
  } finally {
    const { rmSync } = await import('node:fs');
    rmSync(sub, { recursive: true, force: true });
  }
});

test('consentScope: confirm-level without a TTY refuses with guidance', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'kaku-scope-out-')); // /tmp is outside home
  const notTTY = new PassThrough(); // no isTTY
  await assert.rejects(
    () => consentScope(outside, { input: notTTY, output: notTTY }),
    /needs an interactive yes/,
  );
});

test('consentScope: interactive yes grants, no declines', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'kaku-scope-int-'));
  const drive = async (answer) => {
    const input = new PassThrough();
    input.isTTY = true;
    const output = new PassThrough();
    output.isTTY = true;
    output.resume(); // discard prompt text
    const p = consentScope(outside, { input, output });
    input.write(`${answer}\n`);
    return p;
  };
  assert.equal(await drive('y'), realpathSync(outside));
  assert.equal(await drive('n'), null);
});
