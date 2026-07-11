import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createDedupTool } from '../src/tools/dedup.js';

function setup(files) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-dedup-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return createDedupTool({ jail: createJail(root) });
}

test('dedup: finds the true pair, ignores same-size and same-name non-duplicates', () => {
  const out = setup({
    'docs/notes.txt': 'identical content here\n',
    'archive/old.txt': 'identical content here\n',
    'a/metrics.txt': 'x'.repeat(23),          // same size as the pair, different bytes
    'b/metrics.txt': 'y'.repeat(23),          // same name as each other, different bytes
  }).run({});
  assert.match(out, /1 duplicate group found/);
  assert.match(out, /docs\/notes\.txt/);
  assert.match(out, /archive\/old\.txt/);
  assert.ok(!out.includes('metrics.txt'), 'no trap files in the report');
});

test('dedup: groups of three and multiple groups, largest first', () => {
  const out = setup({
    'a.bin': 'BIGBIGBIGBIG',
    'b.bin': 'BIGBIGBIGBIG',
    'c.bin': 'BIGBIGBIGBIG',
    'x.txt': 'small',
    'y.txt': 'small',
  }).run({});
  assert.match(out, /2 duplicate groups found/);
  const firstGroup = out.indexOf('group 1');
  assert.ok(out.indexOf('a.bin') > firstGroup && out.indexOf('a.bin') < out.indexOf('group 2'), 'larger group listed first');
  assert.match(out, /3 files:/);
});

test('dedup: empty files and secret files never appear', () => {
  const out = setup({
    'one.txt': '',
    'two.txt': '',
    '.env': 'API_KEY=twin',
    'env-copy': 'API_KEY=twin',
    'real1.txt': 'dup\n',
    'sub/real2.txt': 'dup\n',
  }).run({});
  assert.match(out, /1 duplicate group found/);
  assert.ok(!out.includes('one.txt') && !out.includes('two.txt'), 'empty files skipped');
  assert.ok(!out.includes('.env'), 'secret files skipped');
});

test('dedup: clean report when nothing duplicates; subdir scan; jail escape refused', () => {
  const tool = setup({
    'a.txt': 'unique one',
    'sub/p.txt': 'pair\n',
    'sub/q.txt': 'pair\n',
  });
  assert.equal(setup({ 'a.txt': 'only' }).run({}), 'no duplicate files found');
  const sub = tool.run({ path: 'sub' });
  assert.match(sub, /sub\/p\.txt/, 'subdir results keep root-relative paths');
  assert.throws(() => tool.run({ path: '../..' }), /escapes project root/);
});

test('dedup: nonexistent scan dir ERRORS instead of reporting no duplicates (measured live)', () => {
  const tool = setup({ 'p.txt': 'pair\n', 'q.txt': 'pair\n' });
  assert.throws(() => tool.run({ path: 'proj' }), /no such directory: proj — omit the path/);
  assert.throws(() => tool.run({ path: 'p.txt' }), /no such directory/, 'a file is not a scan dir');
});

test('dedup: empty-string path means project root, not an error (measured live)', () => {
  const tool = setup({ 'p.txt': 'pair\n', 'q.txt': 'pair\n' });
  assert.match(tool.run({ path: '' }), /1 duplicate group found/);
});
