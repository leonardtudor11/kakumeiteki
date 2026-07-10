import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createTools } from '../src/tools/index.js';

const PROBE_C_FILE = `export function getData(url) {
  return fetch(url).then(r => r.json());
}

export function getDataTwice(url) {
  return Promise.all([getData(url), getData(url)]);
}
`;

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'kaku-tools-'));
  const root = join(base, 'proj');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'api.js'), PROBE_C_FILE);
  writeFileSync(join(root, 'notes.txt'), 'line one\nline two\nline three\nline four\n');
  writeFileSync(join(root, '.env'), 'API_KEY=supersecret');
  writeFileSync(join(root, '.env.example'), 'API_KEY=fill-me-in');
  writeFileSync(join(root, 'env.js'), 'export const env = process.env;');
  writeFileSync(join(root, 'photo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x47, 0x0d, 0x0a]));
  const tools = createTools({ jail: createJail(root) });
  return { root, tools, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('read: returns file content', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.read.run({ path: 'api.js' }), PROBE_C_FILE);
  } finally {
    cleanup();
  }
});

test('read: offset/limit slices lines', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.read.run({ path: 'notes.txt', offset: 2, limit: 2 }), 'line two\nline three');
  } finally {
    cleanup();
  }
});

test('read: jail escape refused', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.read.run({ path: '../../etc/passwd' }), /escapes project root/);
  } finally {
    cleanup();
  }
});

test('read: secret file refused, controls stay readable', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.read.run({ path: '.env' }), /secret/);
    assert.match(tools.read.run({ path: '.env.example' }), /fill-me-in/);
    assert.match(tools.read.run({ path: 'env.js' }), /process\.env/);
  } finally {
    cleanup();
  }
});

test('read: binary file refused cleanly', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.read.run({ path: 'photo.bin' }), /binary file/);
  } finally {
    cleanup();
  }
});

test('read: missing file → clean error', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.read.run({ path: 'ghost.js' }), /file not found: ghost\.js/);
  } finally {
    cleanup();
  }
});

test('read: giant file truncated with continue hint', () => {
  const { root, tools, cleanup } = setup();
  try {
    const bigLine = 'x'.repeat(1000);
    writeFileSync(join(root, 'big.txt'), Array.from({ length: 100 }, () => bigLine).join('\n'));
    const out = tools.read.run({ path: 'big.txt' });
    assert.ok(Buffer.byteLength(out) < 70000);
    assert.match(out, /truncated at 64KB — file has 100 lines, continue with offset=\d+/);
  } finally {
    cleanup();
  }
});

test('write: creates file with parent dirs', () => {
  const { root, tools, cleanup } = setup();
  try {
    const msg = tools.write.run({ path: 'new/deep/mod.js', content: 'export {};\n' });
    assert.match(msg, /wrote 11 bytes/);
    assert.equal(readFileSync(join(root, 'new/deep/mod.js'), 'utf8'), 'export {};\n');
  } finally {
    cleanup();
  }
});

test('write: overwrites existing file', () => {
  const { root, tools, cleanup } = setup();
  try {
    tools.write.run({ path: 'notes.txt', content: 'replaced' });
    assert.equal(readFileSync(join(root, 'notes.txt'), 'utf8'), 'replaced');
  } finally {
    cleanup();
  }
});

test('write: jail escape + secret paths refused', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.write.run({ path: '../evil.js', content: 'x' }), /escapes project root/);
    assert.throws(() => tools.write.run({ path: '.env.production', content: 'KEY=1' }), /secret/);
    assert.throws(() => tools.write.run({ path: 'id_rsa', content: 'x' }), /secret/);
  } finally {
    cleanup();
  }
});

test('edit: Phase 0 regression — non-unique anchor rejected with repair guidance', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(
      () => tools.edit.run({ path: 'api.js', old: 'getData', new: 'fetchData' }),
      /occurs 4x in api\.js — widen the anchor/,
    );
  } finally {
    cleanup();
  }
});

test('edit: unique anchor applies byte-exact (probe C done right)', () => {
  const { root, tools, cleanup } = setup();
  try {
    const msg = tools.edit.run({
      path: 'api.js',
      old: 'export function getData(url)',
      new: 'export function fetchData(url)',
    });
    assert.equal(msg, 'edited api.js: 1 replacement');
    const after = readFileSync(join(root, 'api.js'), 'utf8');
    assert.equal(after, PROBE_C_FILE.replace('export function getData(url)', 'export function fetchData(url)'));
    assert.match(after, /getDataTwice/);
    assert.equal(after.split('getData(url)').length - 1, 2);
  } finally {
    cleanup();
  }
});

test('edit: old not found → re-read guidance', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(
      () => tools.edit.run({ path: 'api.js', old: 'function getdata(url)', new: 'x' }),
      /not found in api\.js — re-read the file/,
    );
  } finally {
    cleanup();
  }
});

test('edit: replaceAll replaces every occurrence and reports count', () => {
  const { root, tools, cleanup } = setup();
  try {
    const msg = tools.edit.run({ path: 'api.js', old: 'getData', new: 'fetchData', replaceAll: true });
    assert.equal(msg, 'edited api.js: 4 replacements');
    const after = readFileSync(join(root, 'api.js'), 'utf8');
    assert.equal(after.includes('getData'), false);
    assert.match(after, /fetchDataTwice/);
  } finally {
    cleanup();
  }
});

test('edit: dollar signs in replacement stay literal (no regex footgun)', () => {
  const { root, tools, cleanup } = setup();
  try {
    writeFileSync(join(root, 'price.js'), 'const price = PLACEHOLDER;\n');
    tools.edit.run({ path: 'price.js', old: 'PLACEHOLDER', new: "'$100 & $& more'" });
    assert.equal(readFileSync(join(root, 'price.js'), 'utf8'), "const price = '$100 & $& more';\n");
  } finally {
    cleanup();
  }
});

test('edit: identical old/new, empty old, secret path, missing file → clean errors', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.edit.run({ path: 'api.js', old: 'x', new: 'x' }), /identical/);
    assert.throws(() => tools.edit.run({ path: 'api.js', old: '', new: 'y' }), /non-empty/);
    assert.throws(() => tools.edit.run({ path: '.env', old: 'a', new: 'b' }), /secret/);
    assert.throws(() => tools.edit.run({ path: 'ghost.js', old: 'a', new: 'b' }), /file not found/);
  } finally {
    cleanup();
  }
});

test('registry: exposes all six tools with coherent schemas', () => {
  const { tools, cleanup } = setup();
  try {
    assert.deepEqual(Object.keys(tools).sort(), ['edit', 'glob', 'grep', 'ls', 'read', 'write']);
    for (const tool of Object.values(tools)) {
      assert.equal(tool.schema.function.name, tool.name);
      assert.ok(Array.isArray(tool.schema.function.parameters.required));
      assert.equal(typeof tool.run, 'function');
    }
  } finally {
    cleanup();
  }
});
