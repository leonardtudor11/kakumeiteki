const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[38;2;192;57;43m';

// The ninja peeks over the bar while the agent works, then slips away.
export const NINJA_FRAMES = ['      ', '    🥷', '   🥷 ', '  🥷  ', '   🥷 ', '    🥷'];

export function renderBar({ model = '', mode = '', ctxPct = 0, busy = false, frame = 0 } = {}, width = 80) {
  const ninja = busy ? NINJA_FRAMES[frame % NINJA_FRAMES.length] : '      ';
  const left = `${RED}⛩ KAKUMEITEKI${RESET}${DIM} · ${model} · ${mode} · ctx ${ctxPct}%${busy ? ' · working' : ''}${RESET}`;
  const plainLen = `⛩ KAKUMEITEKI · ${model} · ${mode} · ctx ${ctxPct}%${busy ? ' · working' : ''}`.length;
  if (plainLen + ninja.length >= width) return left.slice(0, left.length - Math.max(0, plainLen + ninja.length - width + 1));
  return left + ' '.repeat(width - plainLen - ninja.length - 1) + ninja;
}

export function createStatusBar({ output, env = process.env, getCtxPct = () => 0, intervalMs = 280 } = {}) {
  const enabled = Boolean(output?.isTTY) && !env.KAKU_PLAIN && !env.NO_COLOR && (output.rows ?? 0) >= 5;
  const state = { model: '', mode: '', ctxPct: 0, busy: false, frame: 0 };
  let timer = null;
  let started = false;

  const rows = () => output.rows ?? 24;
  const cols = () => output.columns ?? 80;

  function redraw() {
    if (!enabled || !started) return;
    output.write(`\x1b7\x1b[${rows()};1H\x1b[2K${renderBar(state, cols())}\x1b8`);
  }

  function setRegion() {
    output.write(`\x1b7\x1b[1;${rows() - 1}r\x1b8`);
  }

  const onResize = () => {
    if (!started) return;
    setRegion();
    redraw();
  };

  return {
    enabled,
    start() {
      if (!enabled || started) return;
      started = true;
      setRegion();
      output.on?.('resize', onResize);
      redraw();
    },
    setState(partial) {
      const wasBusy = state.busy;
      Object.assign(state, partial);
      state.ctxPct = getCtxPct();
      if (state.busy && !wasBusy && enabled) {
        timer = setInterval(() => {
          state.frame++;
          state.ctxPct = getCtxPct();
          redraw();
        }, intervalMs);
        timer.unref?.();
      }
      if (!state.busy && timer) {
        clearInterval(timer);
        timer = null;
        state.frame = 0;
      }
      redraw();
    },
    stop() {
      if (!enabled || !started) return;
      if (timer) clearInterval(timer);
      timer = null;
      started = false;
      output.removeListener?.('resize', onResize);
      output.write(`\x1b7\x1b[${rows()};1H\x1b[2K\x1b8\x1b[r`);
    },
  };
}
