import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'kaku.js');

function startMockOllama() {
  const bodies = [];
  const server = createServer((req, res) => {
    if (req.url === '/api/version') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ version: 'mock' }));
      return;
    }
    if (req.url === '/api/chat') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        bodies.push(JSON.parse(raw));
        res.setHeader('content-type', 'application/x-ndjson');
        res.write(`${JSON.stringify({ message: { content: 'hi there' }, done: false })}\n`);
        res.end(`${JSON.stringify({ done: true })}\n`);
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, bodies }));
  });
}

function runKaku(args, { cwd, home }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, HOME: home } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

test('cli e2e: one-shot → --continue → --resume against mock endpoint', async () => {
  const { server, port, bodies } = await startMockOllama();
  const home = mkdtempSync(join(tmpdir(), 'kaku-e2e-home-'));
  const proj = mkdtempSync(join(tmpdir(), 'kaku-e2e-proj-'));
  writeFileSync(join(proj, '.kaku.json'), JSON.stringify({ baseUrl: `http://127.0.0.1:${port}`, model: 'mock-model' }));

  try {
    const first = await runKaku(['-p', 'hello'], { cwd: proj, home });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /hi there/);

    const sessionsDir = join(home, '.kakumeiteki', 'sessions');
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(files.length, 1);

    const second = await runKaku(['--continue', '--model', 'other-model', '-p', 'again'], { cwd: proj, home });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /warning: session was mock-model, now using other-model/);
    assert.match(second.stdout, /hi there/);

    const restored = bodies[1].messages;
    const contents = restored.map((m) => m.content);
    assert.ok(contents.some((c) => c.includes('hello')), 'prior user turn restored');
    assert.ok(contents.some((c) => c.includes('hi there')), 'prior assistant turn restored');
    assert.equal(contents.at(-1), 'again');

    const id = files[0].replace(/\.jsonl$/, '');
    const third = await runKaku(['--resume', id, '-p', 'once more'], { cwd: proj, home });
    assert.equal(third.status, 0, third.stderr);
    assert.match(third.stdout, /hi there/);
    assert.ok(bodies[2].messages.length > bodies[1].messages.length, 'resume by id restored the longer history');
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  }
});
