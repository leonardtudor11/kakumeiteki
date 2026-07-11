import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createJunkscanTool } from '../src/tools/junkscan.js';

function setup(files) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-junk-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return createJunkscanTool({ jail: createJail(root) });
}

test('junkscan: flags OS litter, temp/backup artifacts and cache contents — recursively', () => {
  const out = setup({
    '.DS_Store': 'x',
    'img/Thumbs.db': 'x',            // the subdir miss that cost 3.5:4b the baseline run
    'deep/nested/desktop.ini': 'x',
    'build.tmp': 'x',
    'report.bak': 'x',
    'draft.old': 'x',
    'notes.txt~': 'x',
    '~$budget.xlsx': 'x',
    '.file.swp': 'x',
    '__pycache__/mod.cpython-312.pyc': 'x',
    '.cache/anything-at-all.dat': 'x',
  }).run({});
  for (const junk of ['.DS_Store', 'img/Thumbs.db', 'deep/nested/desktop.ini', 'build.tmp', 'report.bak', 'draft.old', 'notes.txt~', '~$budget.xlsx', '.file.swp', 'mod.cpython-312.pyc', 'anything-at-all.dat']) {
    assert.ok(out.includes(junk), `flags ${junk}`);
  }
  assert.match(out, /11 junk files found/);
  assert.match(out, /Windows thumbnail cache/);
  assert.match(out, /inside a cache directory/);
});

test('junkscan: never flags real work — logs, data, code, README', () => {
  const out = setup({
    'src/app.js': 'code',
    'data/customers.csv': 'data',
    'README.md': 'doc',
    'server.log': 'logs can matter — never junk by rule',
    'logs/app.log': 'same',
    'notes-old-ideas.md': 'old in the NAME is not .old the EXTENSION',
    'backup-plan.md': 'not a .bak',
    '.DS_Store': 'x',
  }).run({});
  assert.match(out, /1 junk file found/);
  for (const real of ['app.js', 'customers.csv', 'README', 'server.log', 'app.log', 'notes-old-ideas', 'backup-plan']) {
    assert.ok(!out.includes(real), `${real} not flagged`);
  }
});

test('junkscan: clean tree, sizes and largest-first ordering', () => {
  assert.equal(setup({ 'src/app.js': 'fine' }).run({}), 'no junk files found');
  const out = setup({ 'big.tmp': 'x'.repeat(2048), '.DS_Store': 'xx' }).run({});
  assert.ok(out.indexOf('big.tmp') < out.indexOf('.DS_Store'), 'largest first');
  assert.match(out, /2\.0 KB/);
});

test('junkscan: day-one ergonomics — empty path is root, missing dir errors, jail holds', () => {
  const tool = setup({ '.DS_Store': 'x' });
  assert.match(tool.run({ path: '' }), /1 junk file found/);
  assert.throws(() => tool.run({ path: 'ghost' }), /no such directory: ghost/);
  assert.throws(() => tool.run({ path: '../..' }), /escapes project root/);
});
