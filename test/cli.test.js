import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgv } from '../src/cli.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'kaku.js');

test('parseArgv: no args → defaults', () => {
  assert.deepEqual(parseArgv([]), { help: false, version: false, command: null, task: null, resume: null, cliFlags: {} });
});

test('parseArgv: -p captures the task', () => {
  assert.equal(parseArgv(['-p', 'fix the bug']).task, 'fix the bug');
});

test('parseArgv: value flags map to config keys', () => {
  const out = parseArgv(['--model', 'qwen2.5-coder:3b', '--mode', 'audit', '--permissions', 'readonly']);
  assert.deepEqual(out.cliFlags, { model: 'qwen2.5-coder:3b', mode: 'audit', permissions: 'readonly' });
});

test('parseArgv: --continue → resume latest', () => {
  assert.equal(parseArgv(['--continue']).resume, true);
});

test('parseArgv: --resume with id', () => {
  assert.equal(parseArgv(['--resume', '2026-07-10-session']).resume, '2026-07-10-session');
});

test('parseArgv: --resume without id → latest', () => {
  assert.equal(parseArgv(['--resume']).resume, true);
});

test('parseArgv: --resume followed by a flag does not eat it', () => {
  const out = parseArgv(['--resume', '--model', 'x']);
  assert.equal(out.resume, true);
  assert.equal(out.cliFlags.model, 'x');
});

test('parseArgv: --continue + --resume rejected', () => {
  assert.throws(() => parseArgv(['--continue', '--resume', 'abc']), /once/);
});

test('parseArgv: unknown flag rejected', () => {
  assert.throws(() => parseArgv(['--nope']), /unknown flag "--nope"/);
});

test('parseArgv: -p without value rejected', () => {
  assert.throws(() => parseArgv(['-p']), /requires a task/);
});

test('parseArgv: --model without value rejected', () => {
  assert.throws(() => parseArgv(['--model']), /requires a value/);
});

test('parseArgv: help and version flags', () => {
  assert.equal(parseArgv(['-h']).help, true);
  assert.equal(parseArgv(['--help']).help, true);
  assert.equal(parseArgv(['--version']).version, true);
});

function runBin(args, { cwd }) {
  const home = mkdtempSync(join(tmpdir(), 'kaku-cli-home-'));
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
    timeout: 15000,
  });
  rmSync(home, { recursive: true, force: true });
  return res;
}

function projectFixture(config) {
  const dir = mkdtempSync(join(tmpdir(), 'kaku-cli-proj-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.kaku.json'), JSON.stringify(config));
  return dir;
}

test('bin: --help exits 0 and prints usage', () => {
  const res = runBin(['--help'], { cwd: tmpdir() });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /usage:/);
});

test('bin: unknown flag exits 1 with hint', () => {
  const res = runBin(['--bogus'], { cwd: tmpdir() });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown flag/);
  assert.match(res.stderr, /--help/);
});

test('bin: invalid config value exits 1 naming the key', () => {
  const dir = projectFixture({ mode: 'destroy' });
  const res = runBin(['-p', 'x'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /invalid config value for "mode"/);
});

test('bin: endpoint down → actionable message, exit 1', () => {
  const dir = projectFixture({ baseUrl: 'http://127.0.0.1:9' });
  const res = runBin(['-p', 'x'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Ollama isn't running/);
});

test('bin: --continue with no sessions → clean error, exit 1', () => {
  const dir = projectFixture({ baseUrl: 'http://127.0.0.1:9' });
  const res = runBin(['--continue', '-p', 'x'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(res.status, 1);
});
