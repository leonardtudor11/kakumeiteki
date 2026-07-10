import { createProvider } from './provider.js';
import { createJail } from './permissions.js';
import { createTools } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { openSession, reopenSession, loadSession, latestSessionFor, resolveSessionPath } from './session.js';
import { budgetFor, compact, needsCompaction, countMessages } from './context.js';
import { preloadNamedFiles } from './preload.js';
import { createUndoRecorder } from './undo.js';
import { runTurn } from './loop.js';

const DEFAULT_MICRO_CTX = 8192;

export function tierFor(config) {
  return config.tier === 'auto' ? 'micro' : config.tier;
}

export async function createAgent(config, { cwd = process.cwd(), sessionDir, confirm, providerOpts = {}, resume } = {}) {
  const jail = createJail(cwd);
  const provider = createProvider(config, providerOpts);
  await provider.preflight();

  const tier = tierFor(config);
  const dir = sessionDir ?? config.sessionDir;
  const budget = budgetFor(config.numCtx ?? DEFAULT_MICRO_CTX);

  // Session opens before the tools so the undo recorder (keyed to the session file)
  // exists when the mutating tools are created.
  const warnings = [];
  let session;
  let history = null;

  if (resume) {
    const path = resume === true ? latestSessionFor(dir, jail.root) : resolveSessionPath(dir, resume);
    if (!path) throw new Error(`no resumable session found for ${jail.root}`);
    const loaded = loadSession(path);
    if (loaded.header.model && loaded.header.model !== config.model) warnings.push(`session was ${loaded.header.model}, now using ${config.model}`);
    if (loaded.header.tier && loaded.header.tier !== tier) warnings.push(`session tier was ${loaded.header.tier}, now ${tier}`);
    history = loaded.messages;
    session = reopenSession(path);
    session.append('resumed', { from: path, restored: history.length, warnings });
  } else {
    session = openSession({ dir, cwd: jail.root, model: config.model, tier });
  }

  const undo = createUndoRecorder(session.path);
  const tools = createTools({ jail, config, confirm, undo });
  const system = buildSystemPrompt({ tier, mode: config.mode, tools: Object.values(tools), cwd: jail.root });

  let messages = [{ role: 'system', content: system }, ...(history ?? [])];
  if (history && needsCompaction(messages, budget)) {
    const result = compact(messages, budget);
    if (result.compacted) messages = result.messages;
  }

  return {
    provider,
    session,
    tier,
    budget,
    warnings,
    messages,
    get mode() { return config.mode; },
    // Change mode mid-session: rebuild the system message so the next turn's behaviour
    // follows the new mode (build/refactor/audit/plan). Used by the interactive REPL's
    // Shift+Tab mode cycle.
    setMode(newMode) {
      config.mode = newMode;
      messages[0] = { role: 'system', content: buildSystemPrompt({ tier, mode: newMode, tools: Object.values(tools), cwd: jail.root }) };
      return newMode;
    },
    async run(task, { signal, onDelta, maxTurns = config.maxTurns } = {}) {
      const userInput = `${task}${preloadNamedFiles(task, { jail })}`;
      return runTurn({ provider, session, tools, messages, userInput, signal, onDelta, maxTurns, budget });
    },
  };
}
