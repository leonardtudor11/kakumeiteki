import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { preloadNamedFiles } from '../src/preload.js';

function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kaku-preload-')));
  writeFileSync(join(dir, 'greet.js'), 'export const hi = () => "Hello";\n');
  writeFileSync(join(dir, 'big.js'), 'x'.repeat(10000));
  writeFileSync(join(dir, '.env'), 'SECRET=abcdefghijklmnop1234\n');
  writeFileSync(join(dir, 'conf.js'), 'const api_key = "sk-aaaaaaaaaaaaaaaaaaaaaaaa";\n');
  return { dir, jail: createJail(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('preload: named in-jail file is attached with a no-read hint', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('change Hello to Hi in greet.js', { jail });
  cleanup();
  assert.match(out, /--- greet\.js .*do not call the read tool/);
  assert.match(out, /export const hi/);
});

test('preload: no path-looking tokens → empty string', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('list every function in this project', { jail });
  cleanup();
  assert.equal(out, '');
});

test('preload: missing file and prose tokens like e.g. are skipped', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('e.g. update nope.js please', { jail });
  cleanup();
  assert.equal(out, '');
});

test('preload: oversized file is skipped (agent reads it with the capped tool instead)', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('edit big.js', { jail });
  cleanup();
  assert.equal(out, '');
});

test('preload: secret-glob files are never attached', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('read .env and tell me the keys', { jail });
  cleanup();
  assert.equal(out, '');
});

test('preload: out-of-jail path refused', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('fix ../../etc/hosts.js', { jail });
  cleanup();
  assert.equal(out, '');
});

test('preload: secret values inside an attached file are redacted', () => {
  const { jail, cleanup } = fixture();
  const out = preloadNamedFiles('refactor conf.js', { jail });
  cleanup();
  assert.match(out, /\[REDACTED:R/);
  assert.ok(!out.includes('sk-aaaa'));
});

test('preload: at most two files attached', () => {
  const { dir, jail, cleanup } = fixture();
  writeFileSync(join(dir, 'a.js'), 'a');
  writeFileSync(join(dir, 'b.js'), 'b');
  writeFileSync(join(dir, 'c.js'), 'c');
  const out = preloadNamedFiles('merge a.js b.js c.js', { jail });
  cleanup();
  assert.equal((out.match(/^--- /gm) ?? []).length, 2);
});
