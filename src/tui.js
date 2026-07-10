// Interactive REPL for real terminals: a zero-dep line editor with a bordered input box
// and a pinned status bar. Uses readline's keypress PARSER (arrows/backspace/paste) but
// does its own rendering — no readline line-editing, so the box + status stay put.
//
// Only used when stdin AND stdout are TTYs (see cli.js). Pipes/tests use the plain
// readline path, so this file's raw-mode behaviour never interferes with them.
//
// v1 scope: the box shows while you're at the prompt; during the agent's reply the output
// streams clean and the box returns right after. (Pinning the gauge mid-stream is a later
// refinement — deliberately omitted to avoid partial-line render bugs.)
import * as readline from 'node:readline';
import { homedir } from 'node:os';
import { renderStatusBar, tildeCwd, modeMeta, RESET, DIM, YELLOW } from './statusbar.js';
import { countMessages } from './context.js';
import { createDeltaRenderer } from './ui.js';

const MODE_ORDER = ['build', 'refactor', 'audit', 'plan'];
const isWord = (c) => /\w/.test(c);

export async function runReplInteractive(agent, {
  input = process.stdin, output = process.stdout, errput = process.stderr,
  confirmRef = { fn: null }, config = {},
} = {}) {
  const home = homedir();
  const W = () => output.columns || 80;
  const PLEN = 2; // visible width of "❯ "

  let line = '', cursor = 0;
  const history = []; let hi = null, saved = '';
  let drawn = false, cursorRegionRow = 0;
  let busy = false, abort = null, exiting = false, lastCtrlC = 0;
  let resolveTask = null;                 // resolves the current readTask()
  let confirmResolve = null, confirmBuf = ''; // active y/N confirm

  const modeColor = () => modeMeta(agent.mode).color;
  const renderPrompt = () => `${modeColor()}❯${RESET} `;

  function statusState() {
    const messages = agent.messages ?? [];
    const budget = agent.budget ?? {};
    const used = countMessages(messages);
    return {
      cwd: tildeCwd(process.cwd(), home), model: config.model ?? '', mode: agent.mode ?? '',
      permissions: config.permissions ?? '', numCtx: budget.numCtx ?? 0, used,
      input: budget.input ?? 0, compacting: budget.compactAt ? used > budget.compactAt : false,
    };
  }

  const inputRows = () => Math.max(1, Math.ceil((PLEN + line.length) / W()));
  const curRowCol = () => { const off = PLEN + cursor, w = W(); return { row: Math.floor(off / w), col: off % w }; };
  const wordLeft = (p) => { while (p > 0 && !isWord(line[p - 1])) p--; while (p > 0 && isWord(line[p - 1])) p--; return p; };
  const wordRight = (p) => { const n = line.length; while (p < n && !isWord(line[p])) p++; while (p < n && isWord(line[p])) p++; return p; };

  function moveToTop() { if (!drawn) return; if (cursorRegionRow > 0) output.write(`\x1b[${cursorRegionRow}A`); output.write('\r'); }

  function renderBox() {
    moveToTop();
    output.write('\x1b[0J');
    const bar = `${DIM}${'─'.repeat(W())}${RESET}`;
    output.write(`${bar}\n${renderPrompt()}${line}\n${bar}\n${renderStatusBar(statusState(), { width: W() })}`);
    const lastRow = 1 + inputRows() + 1 + 1 - 1;
    const cur = curRowCol();
    const targetRow = 1 + cur.row;
    const up = lastRow - targetRow;
    if (up > 0) output.write(`\x1b[${up}A`);
    output.write('\r');
    if (cur.col > 0) output.write(`\x1b[${cur.col}C`);
    cursorRegionRow = targetRow; drawn = true;
  }

  function clearBox() { if (drawn) { moveToTop(); output.write('\x1b[0J'); drawn = false; } }
  function printStatic(text) { clearBox(); output.write(text.endsWith('\n') ? text : text + '\n'); }

  function readTask() { return new Promise((res) => { resolveTask = res; renderBox(); }); }
  function finish(val) { const r = resolveTask; resolveTask = null; r?.(val); }
  function cycleMode() { const i = (MODE_ORDER.indexOf(agent.mode) + 1) % MODE_ORDER.length; agent.setMode(MODE_ORDER[i]); renderBox(); }

  confirmRef.fn = ({ command, class: cls }) => new Promise((resolve) => {
    clearBox();
    output.write(`\n${YELLOW}allow ${cls} command:${RESET} ${command}\n[y/N] `);
    confirmBuf = '';
    confirmResolve = (answer) => { confirmResolve = null; resolve(/^y(es)?$/i.test(answer.trim())); };
  });

  function onKey(str, key) {
    key = key || {};
    const n = key.name;
    // --- active y/N confirm (mini line reader) ---
    if (confirmResolve) {
      if (key.ctrl && n === 'c') { output.write('\n'); const r = confirmResolve; confirmResolve = null; r('n'); return; }
      if (n === 'return' || n === 'enter') { output.write('\n'); const r = confirmResolve; confirmResolve = null; r(confirmBuf); return; }
      if (n === 'backspace') { if (confirmBuf) { confirmBuf = confirmBuf.slice(0, -1); output.write('\b \b'); } return; }
      if (str && !key.ctrl && !key.meta) { confirmBuf += str; output.write(str); }
      return;
    }
    // --- during an agent turn: Ctrl-C cancels, double exits ---
    if (busy) {
      if (key.ctrl && n === 'c') { const now = nowMs(); if (now - lastCtrlC < 1000) exiting = true; lastCtrlC = now; abort?.abort(); }
      return;
    }
    // --- idle editing ---
    if (key.ctrl && n === 'c') { if (line) { line = ''; cursor = 0; renderBox(); } else finish(null); return; }
    if (key.ctrl && n === 'd') { if (!line) finish(null); return; }
    if (n === 'tab') { cycleMode(); return; }
    if (n === 'return' || n === 'enter') { const t = line; line = ''; cursor = 0; hi = null; finish(t); return; }
    if (n === 'backspace') { if (cursor > 0) { line = line.slice(0, cursor - 1) + line.slice(cursor); cursor--; renderBox(); } return; }
    if ((key.ctrl || key.meta) && n === 'left') { cursor = wordLeft(cursor); renderBox(); return; }
    if ((key.ctrl || key.meta) && n === 'right') { cursor = wordRight(cursor); renderBox(); return; }
    if (key.meta && n === 'b') { cursor = wordLeft(cursor); renderBox(); return; }
    if (key.meta && n === 'f') { cursor = wordRight(cursor); renderBox(); return; }
    if (n === 'left') { if (cursor > 0) { cursor--; renderBox(); } return; }
    if (n === 'right') { if (cursor < line.length) { cursor++; renderBox(); } return; }
    if (n === 'home' || (key.ctrl && n === 'a')) { cursor = 0; renderBox(); return; }
    if (n === 'end' || (key.ctrl && n === 'e')) { cursor = line.length; renderBox(); return; }
    if (n === 'up') { if (history.length) { if (hi === null) { saved = line; hi = history.length; } if (hi > 0) hi--; line = history[hi]; cursor = line.length; renderBox(); } return; }
    if (n === 'down') { if (hi !== null) { hi++; if (hi >= history.length) { hi = null; line = saved; } else line = history[hi]; cursor = line.length; renderBox(); } return; }
    if (key.ctrl && n === 'w') { const p = wordLeft(cursor); line = line.slice(0, p) + line.slice(cursor); cursor = p; renderBox(); return; }
    if (key.ctrl && n === 'u') { line = line.slice(cursor); cursor = 0; renderBox(); return; }
    if (key.ctrl && n === 'k') { line = line.slice(0, cursor); renderBox(); return; }
    if (str && !key.ctrl && !key.meta) { line = line.slice(0, cursor) + str + line.slice(cursor); cursor += str.length; renderBox(); }
  }

  const onResize = () => { if (!busy && !confirmResolve && drawn) renderBox(); };
  const onEnd = () => { if (resolveTask) finish(null); else exiting = true; }; // stdin closed (EOF / Ctrl-D on some shells)

  readline.emitKeypressEvents(input);
  input.setRawMode?.(true);
  input.on('keypress', onKey);
  input.on('end', onEnd);
  output.on?.('resize', onResize);

  try {
    while (!exiting) {
      const task = await readTask();
      if (task === null) break;                 // Ctrl-C / Ctrl-D on empty line
      const t = task.trim();
      if (!t) continue;
      if (t === 'exit' || t === 'quit') break;
      history.push(t);

      busy = true; abort = new AbortController();
      printStatic(`${DIM}❯${RESET} ${t}`);
      const renderer = createDeltaRenderer((s) => output.write(s));
      let res;
      try {
        res = await agent.run(t, { signal: abort.signal, onDelta: (x) => renderer.push(x) });
      } catch (err) {
        res = { status: 'error', error: err.message };
      }
      renderer.flush();
      output.write('\n');
      busy = false; abort = null;
      if (res.status === 'error') errput.write(`[error] ${res.error}\nsession saved at ${agent.session.path} — resume with --continue\n`);
      else if (res.status !== 'done') errput.write(`[${res.status}]${res.error ? ` ${res.error}` : ''}\n`);
    }
  } finally {
    input.removeListener('keypress', onKey);
    input.removeListener('end', onEnd);
    output.removeListener?.('resize', onResize);
    input.setRawMode?.(false);
    confirmRef.fn = null;
    clearBox();
    output.write('\n');
  }
  return 0;
}

// wall-clock helper kept isolated so tests can reason about it; Date.now is fine at runtime
function nowMs() { return Date.now(); }
