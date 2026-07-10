import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, DEFAULTS } from '../src/config.js';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-config-'));
  const paths = {};
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
    paths[name] = path;
  }
  return { dir, paths, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('no config files → built-in defaults', () => {
  const config = loadConfig({});
  assert.deepEqual(config, DEFAULTS);
  assert.notEqual(config.bash, DEFAULTS.bash);
});

test('missing files at given paths → defaults, no error', () => {
  const config = loadConfig({ globalPath: '/nonexistent/g.json', projectPath: '/nonexistent/p.json' });
  assert.deepEqual(config, DEFAULTS);
});

test('precedence: global overrides defaults', () => {
  const f = fixture({ 'global.json': { model: 'qwen3:1.7b', maxTurns: 10 } });
  try {
    const config = loadConfig({ globalPath: f.paths['global.json'] });
    assert.equal(config.model, 'qwen3:1.7b');
    assert.equal(config.maxTurns, 10);
    assert.equal(config.provider, 'ollama');
  } finally {
    f.cleanup();
  }
});

test('precedence: project overrides global', () => {
  const f = fixture({
    'global.json': { model: 'from-global', tier: 'micro' },
    'project.json': { model: 'from-project' },
  });
  try {
    const config = loadConfig({ globalPath: f.paths['global.json'], projectPath: f.paths['project.json'] });
    assert.equal(config.model, 'from-project');
    assert.equal(config.tier, 'micro');
  } finally {
    f.cleanup();
  }
});

test('precedence: CLI flags override project', () => {
  const f = fixture({
    'global.json': { model: 'from-global' },
    'project.json': { model: 'from-project', mode: 'audit' },
  });
  try {
    const config = loadConfig({
      globalPath: f.paths['global.json'],
      projectPath: f.paths['project.json'],
      cliFlags: { model: 'from-cli' },
    });
    assert.equal(config.model, 'from-cli');
    assert.equal(config.mode, 'audit');
  } finally {
    f.cleanup();
  }
});

test('unknown top-level key → hard error naming key and source', () => {
  const f = fixture({ 'project.json': { modle: 'typo' } });
  try {
    assert.throws(
      () => loadConfig({ projectPath: f.paths['project.json'] }),
      (err) => err.message.includes('"modle"') && err.message.includes('project config'),
    );
  } finally {
    f.cleanup();
  }
});

test('unknown nested bash key → hard error', () => {
  const f = fixture({ 'project.json': { bash: { timeout: 5000 } } });
  try {
    assert.throws(
      () => loadConfig({ projectPath: f.paths['project.json'] }),
      /unknown config key "bash\.timeout"/,
    );
  } finally {
    f.cleanup();
  }
});

test('unknown key in CLI flags → hard error', () => {
  assert.throws(
    () => loadConfig({ cliFlags: { permisions: 'auto' } }),
    (err) => err.message.includes('"permisions"') && err.message.includes('CLI flags'),
  );
});

test('nested bash merge keeps unset sibling defaults', () => {
  const f = fixture({ 'project.json': { bash: { timeoutMs: 5000 } } });
  try {
    const config = loadConfig({ projectPath: f.paths['project.json'] });
    assert.equal(config.bash.timeoutMs, 5000);
    assert.equal(config.bash.maxOutputBytes, DEFAULTS.bash.maxOutputBytes);
  } finally {
    f.cleanup();
  }
});

test('invalid enum value → hard error', () => {
  assert.throws(
    () => loadConfig({ cliFlags: { permissions: 'yolo' } }),
    /invalid config value for "permissions"/,
  );
});

test('mode enum accepts all four modes', () => {
  for (const mode of ['build', 'refactor', 'audit', 'plan']) {
    assert.equal(loadConfig({ cliFlags: { mode } }).mode, mode);
  }
});

test('numCtx: null ok, positive integer ok, junk rejected', () => {
  assert.equal(loadConfig({}).numCtx, null);
  assert.equal(loadConfig({ cliFlags: { numCtx: 8192 } }).numCtx, 8192);
  assert.throws(() => loadConfig({ cliFlags: { numCtx: 'big' } }), /invalid config value for "numCtx"/);
  assert.throws(() => loadConfig({ cliFlags: { numCtx: -1 } }), /invalid config value for "numCtx"/);
});

test('malformed JSON → error naming the file', () => {
  const f = fixture({ 'broken.json': '{ not json' });
  try {
    assert.throws(
      () => loadConfig({ projectPath: f.paths['broken.json'] }),
      (err) => err.message.includes('broken.json') && err.message.includes('not valid JSON'),
    );
  } finally {
    f.cleanup();
  }
});

test('defaults object is not mutated across loads', () => {
  const before = JSON.stringify(DEFAULTS);
  const f = fixture({ 'project.json': { bash: { timeoutMs: 1 }, model: 'x' } });
  try {
    loadConfig({ projectPath: f.paths['project.json'] });
    assert.equal(JSON.stringify(DEFAULTS), before);
  } finally {
    f.cleanup();
  }
});
