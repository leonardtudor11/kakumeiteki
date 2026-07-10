import { createProvider } from './provider.js';
import { createJail } from './permissions.js';
import { createTools } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { openSession, reopenSession, loadSession, latestSessionFor, resolveSessionPath } from './session.js';
import { budgetFor, compact, needsCompaction, countMessages } from './context.js';
import { preloadNamedFiles } from './preload.js';
import { runTurn } from './loop.js';

const DEFAULT_MICRO_CTX = 8192;

export function tierFor(config) {
  return config.tier === 'auto' ? 'micro' : config.tier;
}

export async function createAgent(config, { cwd = process.cwd(), sessionDir, confirm, providerOpts = {}, resume } = {}) {
  const jail = createJail(cwd);
  const provider = createProvider(config, providerOpts);
  await provider.preflight();

  const tools = createTools({ jail, config, confirm });
  const tier = tierFor(config);
  const system = buildSystemPrompt({ tier, mode: config.mode, tools: Object.values(tools), cwd: jail.root });
  const dir = sessionDir ?? config.sessionDir;
  const budget = budgetFor(config.numCtx ?? DEFAULT_MICRO_CTX);

  const warnings = [];
  let session;
  let messages;

  if (resume) {
    const path = resume === true ? latestSessionFor(dir, jail.root) : resolveSessionPath(dir, resume);
    if (!path) throw new Error(`no resumable session found for ${jail.root}`);
    const { header, messages: history } = loadSession(path);
    if (header.model && header.model !== config.model) warnings.push(`session was ${header.model}, now using ${config.model}`);
    if (header.tier && header.tier !== tier) warnings.push(`session tier was ${header.tier}, now ${tier}`);
    messages = [{ role: 'system', content: system }, ...history];
    if (needsCompaction(messages, budget)) {
      const result = compact(messages, budget);
      if (result.compacted) messages = result.messages;
    }
    session = reopenSession(path);
    session.append('resumed', { from: path, restored: history.length, warnings });
  } else {
    session = openSession({ dir, cwd: jail.root, model: config.model, tier });
    messages = [{ role: 'system', content: system }];
  }

  return {
    provider,
    session,
    tier,
    budget,
    warnings,
    messages,
    async run(task, { signal, onDelta, maxTurns = config.maxTurns } = {}) {
      const userInput = `${task}${preloadNamedFiles(task, { jail })}`;
      return runTurn({ provider, session, tools, messages, userInput, signal, onDelta, maxTurns, budget });
    },
  };
}
