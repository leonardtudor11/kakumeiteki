import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDoctor } from '../src/doctor.js';
import { parseArgv } from '../src/cli.js';

const CONFIG = { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' };

function collect() {
  let s = '';
  return { write: (t) => (s += t), get: () => s };
}

const okJson = (obj) => ({ ok: true, json: async () => obj });

test('parseArgv: doctor subcommand recognized first-position only', () => {
  assert.equal(parseArgv(['doctor']).command, 'doctor');
  assert.equal(parseArgv([]).command, null);
  assert.throws(() => parseArgv(['-p', 'x', 'doctor']), /unknown flag/);
});

test('doctor: all green → exit 0', async () => {
  const out = collect();
  const fetchImpl = async (url) =>
    url.endsWith('/api/version') ? okJson({ version: '9.9' }) : okJson({ models: [{ name: 'qwen3.5:4b' }] });
  const code = await runDoctor(CONFIG, { fetchImpl, output: out, nodeVersion: '25.9.0' });
  assert.equal(code, 0);
  assert.match(out.get(), /all good/);
  assert.match(out.get(), /Ollama reachable/);
});

test('doctor: server down → exit 1 with install/serve fix, model check skipped', async () => {
  const out = collect();
  const code = await runDoctor(CONFIG, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, output: out, nodeVersion: '25.9.0' });
  assert.equal(code, 1);
  assert.match(out.get(), /not reachable/);
  assert.match(out.get(), /ollama serve/);
  assert.ok(!out.get().includes('is not pulled'));
});

test('doctor: model missing → exit 1 with pull command', async () => {
  const out = collect();
  const fetchImpl = async (url) =>
    url.endsWith('/api/version') ? okJson({ version: '9.9' }) : okJson({ models: [{ name: 'other:1b' }] });
  const code = await runDoctor(CONFIG, { fetchImpl, output: out, nodeVersion: '25.9.0' });
  assert.equal(code, 1);
  assert.match(out.get(), /ollama pull qwen3\.5:4b/);
});

test('doctor: old node flagged', async () => {
  const out = collect();
  const fetchImpl = async (url) =>
    url.endsWith('/api/version') ? okJson({ version: '9.9' }) : okJson({ models: [{ name: 'qwen3.5:4b' }] });
  const code = await runDoctor(CONFIG, { fetchImpl, output: out, nodeVersion: '18.2.0' });
  assert.equal(code, 1);
  assert.match(out.get(), /too old/);
  assert.match(out.get(), /nodejs\.org/);
});

test('doctor: tagged model variant matches base name', async () => {
  const out = collect();
  const fetchImpl = async (url) =>
    url.endsWith('/api/version') ? okJson({ version: '9.9' }) : okJson({ models: [{ name: 'qwen3.5:4b' }] });
  const code = await runDoctor({ ...CONFIG, model: 'qwen3.5' }, { fetchImpl, output: out, nodeVersion: '25.0.0' });
  assert.equal(code, 0);
});
