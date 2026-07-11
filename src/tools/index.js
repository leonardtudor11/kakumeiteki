import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createLsTool } from './ls.js';
import { createGlobTool } from './glob.js';
import { createGrepTool } from './grep.js';
import { createBashTool } from './bash.js';
import { createDedupTool } from './dedup.js';
import { createSkillTool } from './skill.js';
import { DEFAULTS } from '../config.js';

export function createTools({ jail, config = DEFAULTS, confirm, undo, audit }) {
  const tools = [
    createReadTool({ jail }),
    createWriteTool({ jail, config, undo, confirm, audit }),
    createEditTool({ jail, config, undo, confirm, audit }),
    createLsTool({ jail }),
    createGlobTool({ jail }),
    createGrepTool({ jail }),
    createBashTool({ jail, config, confirm, audit }),
    createDedupTool({ jail }),
    createSkillTool(),
  ];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
