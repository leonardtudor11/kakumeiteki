import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail, actionForFileChange } from '../src/permissions.js';
import { createEditTool } from '../src/tools/edit.js';
import { createWriteTool } from '../src/tools/write.js';
import { previewEdit, previewWrite } from '../src/diff.js';

function setup(permissions, confirm) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-fperm-'));
  writeFileSync(join(root, 'a.txt'), 'alpha bravo\ncharlie\n');
  const jail = createJail(root);
  const config = { permissions };
  const recorded = [];
  const undo = { record: (e) => recorded.push(e) };
  return {
    root, recorded,
    edit: createEditTool({ jail, config, undo, confirm }),
    write: createWriteTool({ jail, config, undo, confirm }),
  };
}

test('actionForFileChange: mutate row of the action table; no config -> auto', () => {
  assert.equal(actionForFileChange('safe'), 'ask');
  assert.equal(actionForFileChange('auto'), 'auto');
  assert.equal(actionForFileChange('readonly'), 'block');
  assert.equal(actionForFileChange(undefined), 'auto');
});

test('readonly: edit and write are blocked, file untouched, nothing recorded for undo', async () => {
  const { root, edit, write, recorded } = setup('readonly');
  await assert.rejects(() => edit.run({ path: 'a.txt', old: 'alpha', new: 'omega' }), /read-only under permissions "readonly"/);
  await assert.rejects(() => write.run({ path: 'b.txt', content: 'x' }), /read-only under permissions "readonly"/);
  assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'alpha bravo\ncharlie\n');
  assert.ok(!existsSync(join(root, 'b.txt')));
  assert.equal(recorded.length, 0);
});

test('safe: declined confirm leaves the file untouched and records no undo entry', async () => {
  const asked = [];
  const { root, edit, recorded } = setup('safe', async (req) => { asked.push(req); return false; });
  await assert.rejects(() => edit.run({ path: 'a.txt', old: 'alpha', new: 'omega' }), /declined by user/);
  assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'alpha bravo\ncharlie\n');
  assert.equal(recorded.length, 0, 'undo records only approved changes');
  assert.equal(asked[0].tool, 'edit');
  assert.match(asked[0].preview, /- alpha/);
  assert.match(asked[0].preview, /\+ omega/);
});

test('safe: approved confirm applies the change and records the pre-image', async () => {
  const { root, edit, recorded } = setup('safe', async () => true);
  await edit.run({ path: 'a.txt', old: 'alpha', new: 'omega' });
  assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'omega bravo\ncharlie\n');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].op, 'edit');
});

test('safe with no confirm channel (one-shot -p): declined, not silently applied', async () => {
  const { root, write } = setup('safe', undefined);
  await assert.rejects(() => write.run({ path: 'b.txt', content: 'x' }), /declined/);
  assert.ok(!existsSync(join(root, 'b.txt')));
});

test('auto: applies silently, confirm never called', async () => {
  let called = 0;
  const { root, write } = setup('auto', async () => { called++; return false; });
  await write.run({ path: 'b.txt', content: 'x' });
  assert.equal(readFileSync(join(root, 'b.txt'), 'utf8'), 'x');
  assert.equal(called, 0);
});

test('write preview reaches the confirm with trimmed old/new lines', async () => {
  const asked = [];
  const { write } = setup('safe', async (req) => { asked.push(req); return true; });
  await write.run({ path: 'a.txt', content: 'alpha bravo\nDELTA\n' });
  assert.match(asked[0].preview, /overwrite a\.txt/);
  assert.match(asked[0].preview, /- charlie/);
  assert.match(asked[0].preview, /\+ DELTA/);
  assert.ok(!/alpha bravo/.test(asked[0].preview.split('\n').slice(1).join('\n')), 'common prefix trimmed');
});

test('previewEdit / previewWrite: shapes, caps, no-change marker', () => {
  const e = previewEdit({ path: 'f.js', old: 'a', new: 'b', count: 3 });
  assert.match(e, /edit f\.js \(3 occurrences\):/);
  assert.match(e, /^- a$/m);
  assert.match(e, /^\+ b$/m);

  const many = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
  const w = previewWrite({ path: 'g.js', before: undefined, content: many });
  assert.match(w, /new file, 30 lines/);
  assert.match(w, /… 18 more lines/);

  assert.equal(previewWrite({ path: 'h.js', before: 'same', content: 'same' }), 'overwrite h.js: (no textual change)');
});
