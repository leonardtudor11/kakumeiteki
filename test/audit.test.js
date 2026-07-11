import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createEditTool } from '../src/tools/edit.js';
import { createBashTool } from '../src/tools/bash.js';
import { createUndoRecorder } from '../src/undo.js';
import { createAuditLog, trimCommand } from '../src/audit.js';
import { openSession } from '../src/session.js';
import { runUndo } from '../src/cli.js';

function setup(permissions = 'auto', confirm) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-audit-'));
  writeFileSync(join(root, 'a.txt'), 'alpha\n');
  const jail = createJail(root);
  const file = join(mkdtempSync(join(tmpdir(), 'kaku-audit-log-')), 'audit.jsonl');
  const audit = createAuditLog({ file, root: jail.root, session: 's.jsonl' });
  const config = { permissions, bash: { timeoutMs: 5000, maxOutputBytes: 65536 } };
  return { root, jail, config, audit, file, confirm };
}

const lines = (file) => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('file outcomes land one audit line each: applied, declined, blocked', async () => {
  const applied = setup('auto');
  await createEditTool({ jail: applied.jail, config: applied.config, audit: applied.audit }).run({ path: 'a.txt', old: 'alpha', new: 'beta' });

  const declined = setup('safe', async () => false);
  await assert.rejects(() => createEditTool({ jail: declined.jail, config: declined.config, audit: declined.audit, confirm: declined.confirm }).run({ path: 'a.txt', old: 'alpha', new: 'beta' }));

  const blocked = setup('readonly');
  await assert.rejects(() => createEditTool({ jail: blocked.jail, config: blocked.config, audit: blocked.audit }).run({ path: 'a.txt', old: 'alpha', new: 'beta' }));

  for (const [ctx, outcome] of [[applied, 'applied'], [declined, 'declined'], [blocked, 'blocked']]) {
    const [line] = lines(ctx.file);
    assert.equal(line.kind, 'file');
    assert.equal(line.tool, 'edit');
    assert.equal(line.path, 'a.txt');
    assert.equal(line.outcome, outcome);
    assert.equal(line.root, ctx.jail.root);
    assert.ok(line.at, 'timestamped');
    assert.ok(!('content' in line) && !('old' in line) && !('new' in line), 'no file content in the audit');
  }
});

test('bash: read-only stays out; mutate records a redacted, trimmed run line', async () => {
  const { jail, config, audit, file } = setup('auto');
  const bash = createBashTool({ jail, config, audit });
  await bash.run({ command: 'cat a.txt' });                       // read-only -> no line
  await bash.run({ command: 'touch made.txt' });                  // mutate -> run
  const all = lines(file);
  assert.equal(all.length, 1, 'read-only command not audited');
  assert.equal(all[0].kind, 'bash');
  assert.equal(all[0].outcome, 'run');
  assert.match(all[0].command, /touch made\.txt/);
});

test('bash: secret in a command is redacted in the audit line', async () => {
  const { jail, config, audit, file } = setup('auto');
  const bash = createBashTool({ jail, config, audit });
  await bash.run({ command: 'API_KEY=sk-abcdefghijklmnopqrstuvwx1234567890abcdef touch x.txt' }).catch(() => {});
  const [line] = lines(file);
  assert.ok(!line.command.includes('sk-abcdefghijklmnop'), 'secret value not in audit');
  assert.match(line.command, /REDACTED/);
});

test('kaku undo appends an audit restore line', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kaku-audit-undo-'));
  writeFileSync(join(root, 'u.txt'), 'one');
  const jail = createJail(root);
  const sessionDir = mkdtempSync(join(tmpdir(), 'kaku-audit-sess-'));
  const session = openSession({ dir: sessionDir, cwd: jail.root, model: 'mock', tier: 'micro' });
  const undo = createUndoRecorder(session.path);
  await createEditTool({ jail, undo }).run({ path: 'u.txt', old: 'one', new: 'two' });

  assert.equal(await runUndo({ sessionDir }, { cwd: root, yes: true, output: { write() {} }, errput: { write() {} } }), 0);
  const all = lines(join(sessionDir, 'audit.jsonl'));
  const restored = all.find((l) => l.kind === 'undo');
  assert.equal(restored.outcome, 'restored');
  assert.equal(restored.path, 'u.txt');
  assert.equal(restored.session, session.path.split('/').pop());
});

test('audit failure warns once and never breaks the caller', () => {
  let warnings = '';
  const bad = createAuditLog({ file: '/dev/null/impossible/audit.jsonl', errput: { write: (s) => (warnings += s) } });
  bad.append({ kind: 'file', outcome: 'applied' });
  bad.append({ kind: 'file', outcome: 'applied' });
  assert.match(warnings, /audit log write failed/);
  assert.equal(warnings.match(/audit log write failed/g).length, 1, 'warned once, not per call');
});

test('trimCommand caps long commands', () => {
  assert.equal(trimCommand('short'), 'short');
  const long = 'x'.repeat(300);
  assert.equal(trimCommand(long).length, 201);
  assert.match(trimCommand(long), /…$/);
});
