import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createLsTool } from './ls.js';
import { createGlobTool } from './glob.js';
import { createGrepTool } from './grep.js';
import { createBashTool } from './bash.js';
import { createSkillTool } from './skill.js';
import { DEFAULTS } from '../config.js';

export function createTools({ jail, config = DEFAULTS, confirm, undo }) {
  const tools = [
    createReadTool({ jail }),
    createWriteTool({ jail, undo }),
    createEditTool({ jail, undo }),
    createLsTool({ jail }),
    createGlobTool({ jail }),
    createGrepTool({ jail }),
    createBashTool({ jail, config, confirm }),
    createSkillTool(),
  ];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
