import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createTools } from '../src/tools/index.js';
import { globToRegExp } from '../src/tools/glob.js';

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'kaku-search-'));
  const root = join(base, 'proj');
  mkdirSync(join(root, 'src', 'util'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(base, 'outside'), { recursive: true });

  writeFileSync(join(root, 'src', 'app.js'), 'function main() { return 42; }\n// TODO wire cli\n');
  writeFileSync(join(root, 'src', 'util', 'helper.js'), 'export function helper() {}\n// TODO cleanup\n');
  writeFileSync(join(root, 'test', 'app.test.js'), 'test("TODO later", () => {});\n');
  writeFileSync(join(root, 'README.md'), '# proj\nTODO write docs\n');
  writeFileSync(join(root, '.env'), 'SECRET_TOKEN=abc123\nTODO hidden\n');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), '// TODO never surface this\n');
  writeFileSync(join(root, '.git', 'config'), '# TODO also hidden\n');
  writeFileSync(join(root, 'photo.bin'), Buffer.concat([Buffer.from([0]), Buffer.from('TODO binary')]));
  writeFileSync(join(base, 'outside', 'x.js'), '// TODO outside jail\n');
  symlinkSync(join(base, 'outside'), join(root, 'linked'));

  const tools = createTools({ jail: createJail(root) });
  return { root, tools, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('ls: sorted entries, dirs marked /, symlinks marked @', () => {
  const { tools, cleanup } = setup();
  try {
    const out = tools.ls.run({});
    assert.ok(out.includes('src/'));
    assert.ok(out.includes('README.md'));
    assert.ok(out.includes('linked@'));
    assert.ok(out.includes('.env'));
  } finally {
    cleanup();
  }
});

test('ls: subdirectory, file target, missing target, escape', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.ls.run({ path: 'src/util' }), 'helper.js');
    assert.throws(() => tools.ls.run({ path: 'README.md' }), /not a directory/);
    assert.throws(() => tools.ls.run({ path: 'ghost' }), /directory not found/);
    assert.throws(() => tools.ls.run({ path: '..' }), /escapes project root/);
  } finally {
    cleanup();
  }
});

test('ls: symlinked dir cannot be listed through (jail refuses)', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.ls.run({ path: 'linked' }), /escapes project root/);
  } finally {
    cleanup();
  }
});

test('glob: **/*.js finds project files, skips node_modules/.git/symlinks', () => {
  const { tools, cleanup } = setup();
  try {
    const out = tools.glob.run({ pattern: '**/*.js' }).split('\n');
    assert.deepEqual(out, ['src/app.js', 'src/util/helper.js', 'test/app.test.js']);
  } finally {
    cleanup();
  }
});

test('glob: single-star stays within one segment', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.glob.run({ pattern: 'src/*.js' }), 'src/app.js');
    assert.equal(tools.glob.run({ pattern: '*.md' }), 'README.md');
  } finally {
    cleanup();
  }
});

test('glob: ? matches one char; scoped path outputs root-relative', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.glob.run({ pattern: 'src/ap?.js' }), 'src/app.js');
    assert.equal(tools.glob.run({ pattern: '*.js', path: 'src/util' }), 'src/util/helper.js');
  } finally {
    cleanup();
  }
});

test('glob: no matches → friendly string; missing pattern → error', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.glob.run({ pattern: '**/*.py' }), 'no matches');
    assert.throws(() => tools.glob.run({}), /pattern is required/);
  } finally {
    cleanup();
  }
});

test('glob: nonexistent search dir ERRORS instead of lying "no matches"', () => {
  const { tools, cleanup } = setup();
  try {
    assert.throws(() => tools.glob.run({ pattern: '*.js', path: 'ghost-dir' }), /no such directory: ghost-dir/);
  } finally {
    cleanup();
  }
});

test('globToRegExp: regex specials in filenames are escaped', () => {
  assert.ok(globToRegExp('a+b.js').test('a+b.js'));
  assert.ok(!globToRegExp('a+b.js').test('aab.js'));
  assert.ok(!globToRegExp('a.js').test('axjs'));
});

test('grep: finds matches as path:line:text, never leaks secrets/deps/binaries/outside', () => {
  const { tools, cleanup } = setup();
  try {
    const out = tools.grep.run({ pattern: 'TODO' });
    assert.match(out, /^README\.md:2:TODO write docs$/m);
    assert.match(out, /^src\/app\.js:2:\/\/ TODO wire cli$/m);
    assert.match(out, /^src\/util\/helper\.js:2:\/\/ TODO cleanup$/m);
    assert.match(out, /^test\/app\.test\.js:1:/m);
    assert.ok(!out.includes('hidden'));
    assert.ok(!out.includes('never surface'));
    assert.ok(!out.includes('also hidden'));
    assert.ok(!out.includes('binary'));
    assert.ok(!out.includes('outside jail'));
    assert.ok(!out.includes('abc123'));
  } finally {
    cleanup();
  }
});

test('grep: real regex + ignoreCase', () => {
  const { tools, cleanup } = setup();
  try {
    assert.match(tools.grep.run({ pattern: 'function \\w+\\(' }), /src\/app\.js:1/);
    assert.match(tools.grep.run({ pattern: 'todo wire', ignoreCase: true }), /src\/app\.js:2/);
    assert.equal(tools.grep.run({ pattern: 'todo wire' }), 'no matches');
  } finally {
    cleanup();
  }
});

test('grep: single file target, root-relative output', () => {
  const { tools, cleanup } = setup();
  try {
    assert.equal(tools.grep.run({ pattern: 'TODO', path: 'src/app.js' }), 'src/app.js:2:// TODO wire cli');
  } finally {
    cleanup();
  }
});

test('grep: scoped to directory', () => {
  const { tools, cleanup } = setup();
  try {
    const out = tools.grep.run({ pattern: 'TODO', path: 'src' });
    assert.match(out, /src\/app\.js:2/);
    assert.match(out, /src\/util\/helper\.js:2/);
    assert.ok(!out.includes('README'));
  } finally {
    cleanup();
  }
});

test('grep: invalid regex → clean error; match cap honored', () => {
  const { root, tools, cleanup } = setup();
  try {
    assert.throws(() => tools.grep.run({ pattern: '(' }), /invalid regex/);
    writeFileSync(join(root, 'many.txt'), Array.from({ length: 200 }, () => 'TODO x').join('\n'));
    const out = tools.grep.run({ pattern: 'TODO', path: 'many.txt' });
    assert.equal(out.split('\n').length, 101);
    assert.match(out, /stopped at 100 matches/);
  } finally {
    cleanup();
  }
});
