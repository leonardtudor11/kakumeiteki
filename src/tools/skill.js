import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playbooks ship with the tool itself, not the user's project — this is the one
// deliberate read outside the jail: a fixed dir, basename-whitelisted, read-only.
const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');

export function listSkills() {
  try {
    return readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

export function createSkillTool() {
  const names = listSkills();
  return {
    name: 'skill',
    schema: {
      type: 'function',
      function: {
        name: 'skill',
        description: `Consult a built-in engineering playbook BEFORE designing or implementing in its domain (cited best practice: options, tradeoffs, defaults). One playbook per task. Available: ${names.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: `playbook name, one of: ${names.join(', ')}` },
          },
          required: ['name'],
        },
      },
    },
    run({ name } = {}) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name) || !names.includes(name)) {
        throw new Error(`unknown playbook ${JSON.stringify(name)} — available: ${names.join(', ')}`);
      }
      return readFileSync(join(SKILLS_DIR, `${name}.md`), 'utf8');
    },
  };
}
