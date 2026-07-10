import { createProvider } from './provider.js';
import { createJail } from './permissions.js';
import { createTools } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { openSession } from './session.js';
import { runTurn } from './loop.js';

export function tierFor(config) {
  return config.tier === 'auto' ? 'micro' : config.tier;
}

export async function createAgent(config, { cwd = process.cwd(), sessionDir, confirm, providerOpts = {} } = {}) {
  const jail = createJail(cwd);
  const provider = createProvider(config, providerOpts);
  await provider.preflight();

  const tools = createTools({ jail, config, confirm });
  const tier = tierFor(config);
  const system = buildSystemPrompt({ tier, mode: config.mode, tools: Object.values(tools), cwd: jail.root });
  const session = openSession({
    dir: sessionDir ?? config.sessionDir,
    cwd: jail.root,
    model: config.model,
    tier,
  });
  const messages = [{ role: 'system', content: system }];

  return {
    provider,
    session,
    tier,
    messages,
    async run(task, { signal, onDelta, maxTurns = config.maxTurns } = {}) {
      return runTurn({ provider, session, tools, messages, userInput: task, signal, onDelta, maxTurns });
    },
  };
}
