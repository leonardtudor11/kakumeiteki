import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { createJail, JailError } from '../src/permissions.js';

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'kaku-jail-'));
  const root = join(base, 'proj');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'app.js'), 'inside');
  writeFileSync(join(base, 'secret.txt'), 'outside');
  mkdirSync(join(base, 'proj-evil'));
  writeFileSync(join(base, 'proj-evil', 'x.js'), 'sibling attack');
  symlinkSync('/etc', join(root, 'evil-dir'));
  symlinkSync(join(base, 'secret.txt'), join(root, 'evil-file'));
  const jail = createJail(root);
  return { base, root: jail.root, jail, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const refused = (jail, input) =>
  assert.throws(() => jail.resolve(input), JailError, `expected refusal for: ${input}`);

test('S1: absolute path outside jail → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '/etc/passwd');
  } finally {
    cleanup();
  }
});

test('S2: naive ../ traversal → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '../../../../etc/passwd');
  } finally {
    cleanup();
  }
});

test('S3: traversal buried mid-path → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, 'src/../../../etc/hosts');
  } finally {
    cleanup();
  }
});

test('S4: dir symlink escape (evil-dir → /etc) → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, 'evil-dir/hosts');
  } finally {
    cleanup();
  }
});

test('S5: file symlink escape (evil-file → outside file) → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, 'evil-file');
  } finally {
    cleanup();
  }
});

test('S6 control: absolute path inside root → allow', () => {
  const { jail, root, cleanup } = setup();
  try {
    assert.equal(jail.resolve(join(root, 'src', 'app.js')), join(root, 'src', 'app.js'));
  } finally {
    cleanup();
  }
});

test('S7: tilde paths → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '~/anything');
    refused(jail, '~');
  } finally {
    cleanup();
  }
});

test('S8: null byte in path → clean JailError, no crash', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, 'src/app\0.js');
  } finally {
    cleanup();
  }
});

test('S9: case-trick path → refuse (realpath does not case-fold; deny-by-default)', () => {
  const { jail, root, cleanup } = setup();
  try {
    refused(jail, join(root.toUpperCase(), 'src', 'app.js'));
  } finally {
    cleanup();
  }
});

test('S10: write target ../evil.js (nonexistent, outside) → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '../evil.js');
  } finally {
    cleanup();
  }
});

test('S11: edit through symlink pointing outside → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, './evil-file');
  } finally {
    cleanup();
  }
});

test('S12: search rooted at .. or absolute outside → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '..');
    refused(jail, '/');
    refused(jail, '/tmp');
  } finally {
    cleanup();
  }
});

test('prefix collision: sibling dir sharing root prefix → refuse', () => {
  const { jail, cleanup } = setup();
  try {
    refused(jail, '../proj-evil/x.js');
  } finally {
    cleanup();
  }
});

test('control: relative path inside jail → canonical absolute', () => {
  const { jail, root, cleanup } = setup();
  try {
    assert.equal(jail.resolve('src/app.js'), join(root, 'src', 'app.js'));
  } finally {
    cleanup();
  }
});

test('control: nonexistent nested write path inside jail → allow with canonical path', () => {
  const { jail, root, cleanup } = setup();
  try {
    assert.equal(jail.resolve('new/deep/file.js'), join(root, 'new', 'deep', 'file.js'));
  } finally {
    cleanup();
  }
});

test('control: jail root itself resolves to root', () => {
  const { jail, root, cleanup } = setup();
  try {
    assert.equal(jail.resolve('.'), root);
    assert.ok(!root.endsWith(sep));
  } finally {
    cleanup();
  }
});
