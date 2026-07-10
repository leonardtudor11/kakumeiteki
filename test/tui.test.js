import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { MASK, renderMaskRows, renderGrid, showBanner } from '../src/banner.js';
import { SPLASH, SMALL, TINY } from '../src/mask-data.js';
import { NINJA_FRAMES, renderBar, createStatusBar } from '../src/statusbar.js';

test('mask: every row 44 px, even row count, only palette chars, symmetric', () => {
  assert.equal(MASK.length % 2, 0);
  for (const row of MASK) {
    assert.equal(row.length, 44, row);
    assert.match(row, /^[.KDSWGORX]+$/, row);
    assert.equal(row, [...row].reverse().join(''), `asymmetric: ${row}`);
  }
});

test('renderMaskRows: one char row per two pixel rows, truecolor half-blocks', () => {
  const rows = renderMaskRows();
  assert.equal(rows.length, MASK.length / 2);
  assert.ok(rows.every((r) => /[▀▄ ]/.test(r)));
  assert.match(rows[1], /\x1b\[38;2;230;180;60m/, 'horn gold present');
});

test('showBanner: writes mask, title, version — no real delays needed', async () => {
  let out = '';
  await showBanner({ write: (s) => (out += s), columns: 100 }, { version: '9.9.9', sleep: async () => {} });
  assert.match(out, /K A K U M E I T E K I/);
  assert.match(out, /v9\.9\.9/);
  assert.match(out, /革命的/);
  assert.match(out, /[▀▄]/, 'renders half-block mask');
});

for (const [name, grid] of [['SPLASH', SPLASH], ['SMALL', SMALL], ['TINY', TINY]]) {
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

test('renderBar: shows name, model, mode, ctx%, ninja only when busy', () => {
  const idle = renderBar({ model: 'qwen3.5:4b', mode: 'build', ctxPct: 38, busy: false }, 100);
  assert.match(idle, /KAKUMEITEKI/);
  assert.match(idle, /qwen3\.5:4b/);
  assert.match(idle, /build/);
  assert.match(idle, /ctx 38%/);
  assert.ok(!idle.includes('🥷'));
  const busy = renderBar({ model: 'm', mode: 'build', ctxPct: 1, busy: true, frame: 1 }, 100);
  assert.ok(busy.includes('🥷'));
  assert.match(busy, /working/);
});

test('statusbar: fully inert on non-TTY output', () => {
  let writes = 0;
  const bar = createStatusBar({ output: { write: () => writes++ }, env: {} });
  assert.equal(bar.enabled, false);
  bar.start();
  bar.setState({ model: 'x', busy: true });
  bar.setState({ busy: false });
  bar.stop();
  assert.equal(writes, 0);
});

test('statusbar: KAKU_PLAIN disables even on TTY', () => {
  const out = { isTTY: true, rows: 30, columns: 80, write: () => {} };
  assert.equal(createStatusBar({ output: out, env: { KAKU_PLAIN: '1' } }).enabled, false);
});

function fakeTty() {
  const listeners = {};
  return {
    isTTY: true,
    rows: 30,
    columns: 80,
    buf: '',
    write(s) { this.buf += s; },
    on(ev, fn) { listeners[ev] = fn; },
    removeListener(ev) { delete listeners[ev]; },
    emit(ev) { listeners[ev]?.(); },
  };
}

test('statusbar: scroll region on start, bar content on setState, reset on stop', () => {
  const out = fakeTty();
  const bar = createStatusBar({ output: out, env: {}, getCtxPct: () => 42 });
  bar.start();
  assert.match(out.buf, /\x1b\[1;29r/, 'scroll region rows 1..rows-1');
  bar.setState({ model: 'qwen3.5:4b', mode: 'audit' });
  assert.match(out.buf, /\x1b\[30;1H/, 'draws on last row');
  assert.match(out.buf, /qwen3\.5:4b/);
  assert.match(out.buf, /ctx 42%/);
  bar.stop();
  assert.match(out.buf, /\x1b\[r/, 'scroll region reset');
});

test('statusbar: busy animates ninja frames, idle stops them', async () => {
  const out = fakeTty();
  const bar = createStatusBar({ output: out, env: {}, intervalMs: 20 });
  bar.start();
  bar.setState({ model: 'm', mode: 'build', busy: true });
  await sleep(90);
  bar.setState({ busy: false });
  const frames = NINJA_FRAMES.filter((f) => f.trim()).some((f) => out.buf.includes(f.trim()));
  assert.ok(frames, 'ninja appeared during busy');
  const len = out.buf.length;
  await sleep(60);
  assert.equal(out.buf.length, len, 'no redraws after idle');
  bar.stop();
});
