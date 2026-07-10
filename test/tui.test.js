import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderGrid, showBanner, showWelcome } from '../src/banner.js';
import { SPLASH, SMALL } from '../src/mask-data.js';
import { renderStatusBar, gaugeColor, short, tildeCwd, MODE_META } from '../src/statusbar.js';

test('showBanner: writes mask, title, version — no real delays needed', async () => {
  let out = '';
  await showBanner({ write: (s) => (out += s), columns: 100 }, { version: '9.9.9', sleep: async () => {} });
  assert.match(out, /K A K U M E I T E K I/);
  assert.match(out, /v9\.9\.9/);
  assert.match(out, /革命的/);
  assert.match(out, /[▀▄]/, 'renders half-block mask');
});

for (const [name, grid] of [['SPLASH', SPLASH], ['SMALL', SMALL]]) {
  test(`mask-data ${name}: valid grid — dims, chars, palette all consistent`, () => {
    assert.equal(grid.rows.length, grid.h, 'row count = h');
    assert.equal(grid.palette.length, grid.chars.length, 'one palette entry per char');
    const allowed = new RegExp(`^[${grid.chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.]+$`);
    for (const row of grid.rows) {
      assert.equal(row.length, grid.w, `row width = w: ${row}`);
      assert.match(row, allowed, `only palette chars or '.': ${row}`);
    }
    for (const c of grid.palette) {
      assert.equal(c.length, 3);
      for (const v of c) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `rgb 0..255: ${v}`);
    }
  });
}

test('renderGrid: truecolor emits 24-bit half-blocks; Apple_Terminal emits xterm-256 only', () => {
  const tc = renderGrid(SMALL, { apple: false }).join('\n');
  assert.equal(renderGrid(SMALL).length, SMALL.h / 2, 'one char row per two pixel rows');
  assert.match(tc, /[▀▄]/, 'half-blocks present');
  assert.match(tc, /\x1b\[38;2;\d+;\d+;\d+m/, 'truecolor fg');
  const ap = renderGrid(SMALL, { apple: true }).join('\n');
  assert.match(ap, /\x1b\[38;5;\d+m/, 'xterm-256 fg on Apple_Terminal');
  assert.ok(!/\x1b\[38;2;/.test(ap), 'no truecolor leaks on Apple_Terminal');
});

test('showBanner: Apple_Terminal path uses xterm-256, no truecolor leak', async () => {
  let out = '';
  await showBanner({ write: (s) => (out += s), columns: 100 }, { version: '1.0', sleep: async () => {}, env: { TERM_PROGRAM: 'Apple_Terminal' } });
  assert.match(out, /\x1b\[38;5;\d+m/, 'xterm-256 present');
  assert.ok(!/\x1b\[38;2;/.test(out), 'no truecolor on Apple_Terminal (it mangles 38;2)');
});

test('showBanner: narrow terminal falls back from SPLASH to SMALL', async () => {
  const rows = (cols) => { let n = 0; return { write: (s) => (n += (s.match(/\n/g) || []).length), columns: cols, get lines() { return n; } }; };
  const wide = rows(100); await showBanner(wide, { sleep: async () => {} });
  const narrow = rows(30); await showBanner(narrow, { sleep: async () => {} });
  assert.ok(wide.lines > narrow.lines, 'wide renders the taller SPLASH, narrow the SMALL');
});

const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI for content assertions

test('renderStatusBar: shows cwd, model+window, ctx gauge, kanji+mode, permissions', () => {
  const f = plain(renderStatusBar({ cwd: '~/proj', model: 'qwen3.5:4b', mode: 'build', permissions: 'safe', numCtx: 8000, used: 1440, input: 7000 }, { width: 100 }));
  assert.match(f, /~\/proj/);
  assert.match(f, /qwen3\.5:4b/);
  assert.match(f, /8k ctx/, 'context window size shown');
  assert.match(f, /ctx 21%/, '1440/7000 ≈ 21%');
  assert.match(f, /1\.4k\/7k tok/, 'token counts shown');
  assert.match(f, /侍 build/, 'kanji marker + mode');
  assert.match(f, /safe/);
});

test('MODE_META: every config mode has a distinct kanji and colour', () => {
  const modes = ['build', 'refactor', 'audit', 'plan'];
  const kanji = new Set();
  for (const m of modes) {
    assert.ok(MODE_META[m], `${m} present`);
    assert.match(MODE_META[m].color, /\x1b\[38;5;\d+m/, `${m} coloured`);
    kanji.add(MODE_META[m].kanji);
  }
  assert.equal(kanji.size, 4, 'four distinct kanji');
});

test('showWelcome: session line (model, kanji mode, permissions) + honest capability lines, no mask', () => {
  let out = '';
  showWelcome({ write: (s) => (out += s) }, { model: 'qwen3.5:4b', mode: 'plan', permissions: 'safe' });
  const p = plain(out);
  assert.match(p, /qwen3\.5:4b/);
  assert.match(p, /忍 plan/, 'kanji marker for the active mode');
  assert.match(p, /safe/);
  assert.match(p, /reliable/);
  assert.match(p, /verify every diff/);
  assert.ok(!/[▀▄]/.test(out), 'no mask in the welcome card');
});

test('gaugeColor: green low, yellow mid, red high', () => {
  assert.equal(gaugeColor(30), gaugeColor(0));
  assert.notEqual(gaugeColor(30), gaugeColor(70));
  assert.notEqual(gaugeColor(70), gaugeColor(90));
  assert.match(gaugeColor(90), /38;5;160/, 'red at high fill');
});

test('short: compact token/context formatting', () => {
  assert.equal(short(940), '940');
  assert.equal(short(1440), '1.4k');
  assert.equal(short(8000), '8k');
  assert.equal(short(32768), '33k');
});

test('tildeCwd: collapses $HOME to ~', () => {
  assert.equal(tildeCwd('/Users/x/proj', '/Users/x'), '~/proj');
  assert.equal(tildeCwd('/Users/x', '/Users/x'), '~');
  assert.equal(tildeCwd('/opt/other', '/Users/x'), '/opt/other');
});

test('renderStatusBar: compaction warning appears only when compacting', () => {
  const base = { cwd: '~', model: 'm', mode: 'build', numCtx: 8000, used: 6000, input: 7000 };
  assert.ok(!/compacting/.test(renderStatusBar({ ...base, compacting: false })));
  assert.match(renderStatusBar({ ...base, compacting: true }), /↯ compacting soon/);
});

test('renderStatusBar: drops droppable permissions on a narrow terminal, keeps essentials', () => {
  const f = plain(renderStatusBar({ cwd: '~/p', model: 'm', mode: 'build', permissions: 'readonly', numCtx: 8000, used: 0, input: 7000 }, { width: 30 }));
  assert.ok(!/readonly/.test(f), 'permissions dropped when too wide');
  assert.match(f, /侍 build/, 'mode kept');
  assert.match(f, /ctx 0%/, 'ctx gauge kept');
});
