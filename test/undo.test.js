import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { createJail } from '../src/permissions.js';
import { createEditTool } from '../src/tools/edit.js';
import { createWriteTool } from '../src/tools/write.js';
import { createUndoRecorder, undoDirFor, nextUndo, restore, readManifest } from '../src/undo.js';
import { openSession, readSession } from '../src/session.js';
import { runUndo } from '../src/cli.js';

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'kaku-undo-'));
  const jail = createJail(cwd);
  const sessionDir = mkdtempSync(join(tmpdir(), 'kaku-undo-sessions-'));
  const session = openSession({ dir: sessionDir, cwd: jail.root, model: 'mock', tier: 'micro' });
  const undo = createUndoRecorder(session.path);
  return { cwd, jail, sessionDir, session, undo };
}

const out = () => { const o = { s: '' }; o.write = (x) => { o.s += x; return true; }; return o; };

test('edit records a pre-image blob; restore is byte-identical', () => {
  const { jail, session, undo } = setup();
  writeFileSync(join(jail.root, 'a.txt'), 'alpha beta gamma\n');
  createEditTool({ jail, undo }).run({ path: 'a.txt', old: 'beta', new: 'BETA' });
  assert.equal(readFileSync(join(jail.root, 'a.txt'), 'utf8'), 'alpha BETA gamma\n');

  const dir = undoDirFor(session.path);
  const entry = nextUndo(dir);
  assert.equal(entry.op, 'edit');
  assert.equal(entry.existed, true);
  restore(dir, entry);
  assert.equal(readFileSync(join(jail.root, 'a.txt'), 'utf8'), 'alpha beta gamma\n');
  assert.equal(nextUndo(dir), null, 'entry consumed');
});

test('write to a NEW file records existed=false; undo deletes it', () => {
  const { jail, session, undo } = setup();
  createWriteTool({ jail, undo }).run({ path: 'new/deep/file.txt', content: 'hello' });
  const target = join(jail.root, 'new/deep/file.txt');
  assert.ok(existsSync(target));

  const dir = undoDirFor(session.path);
  const entry = nextUndo(dir);
  assert.equal(entry.existed, false);
  assert.ok(!existsSync(join(dir, `${entry.n}.blob`)), 'no blob for a file that did not exist');
  restore(dir, entry);
  assert.ok(!existsSync(target), 'undo removes the created file');
});

test('write over an EXISTING file restores the pre-image', () => {
  const { jail, session, undo } = setup();
  writeFileSync(join(jail.root, 'b.txt'), 'original');
  createWriteTool({ jail, undo }).run({ path: 'b.txt', content: 'clobbered' });
  const dir = undoDirFor(session.path);
  restore(dir, nextUndo(dir));
  assert.equal(readFileSync(join(jail.root, 'b.txt'), 'utf8'), 'original');
});

test('undo stack walks backwards through multiple changes', () => {
  const { jail, session, undo } = setup();
  writeFileSync(join(jail.root, 'c.txt'), 'v1');
  const edit = createEditTool({ jail, undo });
  edit.run({ path: 'c.txt', old: 'v1', new: 'v2' });
  edit.run({ path: 'c.txt', old: 'v2', new: 'v3' });

  const dir = undoDirFor(session.path);
  restore(dir, nextUndo(dir));
  assert.equal(readFileSync(join(jail.root, 'c.txt'), 'utf8'), 'v2', 'first undo -> v2');
  restore(dir, nextUndo(dir));
  assert.equal(readFileSync(join(jail.root, 'c.txt'), 'utf8'), 'v1', 'second undo -> v1');
  assert.equal(nextUndo(dir), null, 'stack exhausted');
});

test('recorder numbering stays monotonic across process restarts', () => {
  const { jail, session, undo } = setup();
  writeFileSync(join(jail.root, 'd.txt'), 'x');
  createEditTool({ jail, undo }).run({ path: 'd.txt', old: 'x', new: 'y' });
  // simulate a resumed session: fresh recorder over the same session file
  const undo2 = createUndoRecorder(session.path);
  createEditTool({ jail, undo: undo2 }).run({ path: 'd.txt', old: 'y', new: 'z' });
  const { entries } = readManifest(undoDirFor(session.path));
  assert.deepEqual(entries.map((e) => e.n), [1, 2]);
});

test('kaku undo end-to-end: confirm, restore, session audit event, stack exhaustion', async () => {
  const { cwd, jail, sessionDir, session, undo } = setup();
  writeFileSync(join(jail.root, 'e.txt'), 'before');
  createEditTool({ jail, undo }).run({ path: 'e.txt', old: 'before', new: 'after' });
  const config = { sessionDir };

  // declined confirm leaves the file alone
  const input = new PassThrough();
  input.write('n\n');
  const declined = await runUndo(config, { cwd, input, output: out(), errput: out() });
  assert.equal(declined, 1);
  assert.equal(readFileSync(join(jail.root, 'e.txt'), 'utf8'), 'after');

  // --yes restores and logs an audit event to the session
  const o = out();
  assert.equal(await runUndo(config, { cwd, yes: true, output: o, errput: out() }), 0);
  assert.equal(readFileSync(join(jail.root, 'e.txt'), 'utf8'), 'before');
  assert.match(o.s, /restored e\.txt/);
  const events = readSession(session.path).events;
  assert.ok(events.some((e) => e.type === 'undo_restore' && e.path === 'e.txt'), 'audit event appended');

  // nothing left
  const err = out();
  assert.equal(await runUndo(config, { cwd, yes: true, output: out(), errput: err }), 1);
  assert.match(err.s, /nothing to undo/);
});

test('kaku undo refuses a manifest entry outside the jail, and no-session dirs', async () => {
  const { cwd, sessionDir, session } = setup();
  const dir = undoDirFor(session.path);
  const foreign = createUndoRecorder(session.path);
  foreign.record({ path: 'evil', real: '/etc/hosts', op: 'edit', content: 'x' });
  const err = out();
  assert.equal(await runUndo({ sessionDir }, { cwd, yes: true, output: out(), errput: err }), 1);
  assert.match(err.s, /outside/);
  assert.ok(nextUndo(dir), 'entry NOT consumed by the refusal');

  const emptyDir = mkdtempSync(join(tmpdir(), 'kaku-undo-none-'));
  const err2 = out();
  assert.equal(await runUndo({ sessionDir: mkdtempSync(join(tmpdir(), 'kaku-undo-sess2-')) }, { cwd: emptyDir, yes: true, output: out(), errput: err2 }), 1);
  assert.match(err2.s, /no session found/);
});
