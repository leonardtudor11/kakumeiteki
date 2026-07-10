const GREEN = '\x1b[32m';
const RED_ = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export async function runDoctor(config, {
  fetchImpl = fetch,
  output = process.stdout,
  nodeVersion = process.versions.node,
} = {}) {
  const checks = [];
  const pass = (name) => checks.push({ pass: true, name });
  const fail = (name, fix) => checks.push({ pass: false, name, fix });

  const major = Number(nodeVersion.split('.')[0]);
  if (major >= 20) pass(`Node ${nodeVersion} (need ≥ 20)`);
  else fail(`Node ${nodeVersion} is too old (need ≥ 20)`, 'install Node 20+ from https://nodejs.org');

  let serverUp = false;
  try {
    const res = await fetchImpl(`${config.baseUrl}/api/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { version } = await res.json();
    serverUp = true;
    pass(`Ollama reachable at ${config.baseUrl} (v${version})`);
  } catch {
    fail(`Ollama not reachable at ${config.baseUrl}`, 'install from https://ollama.com, then start the app or run: ollama serve');
  }

  if (serverUp) {
    try {
      const res = await fetchImpl(`${config.baseUrl}/api/tags`);
      const { models = [] } = await res.json();
      const names = models.map((m) => m.name);
      if (names.some((n) => n === config.model || n.startsWith(`${config.model}:`))) {
        pass(`model "${config.model}" is pulled`);
      } else {
        fail(`model "${config.model}" is not pulled`, `ollama pull ${config.model}`);
      }
    } catch {
      fail(`could not list models on ${config.baseUrl}`, 'ollama serve logs may say why');
    }
  }

  output.write('kaku doctor\n');
  for (const c of checks) {
    output.write(`  ${c.pass ? `${GREEN}✓${RESET}` : `${RED_}✗${RESET}`} ${c.name}\n`);
    if (c.fix) output.write(`      ${DIM}fix: ${c.fix}${RESET}\n`);
  }
  const problems = checks.filter((c) => !c.pass).length;
  output.write(problems === 0
    ? `\n${GREEN}all good${RESET} — run: kaku\n`
    : `\n${RED_}${problems} problem${problems > 1 ? 's' : ''} found${RESET} — apply the fixes above, then re-run: kaku doctor\n`);
  return problems === 0 ? 0 : 1;
}
