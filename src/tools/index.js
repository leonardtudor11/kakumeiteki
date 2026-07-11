import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createLsTool } from './ls.js';
import { createGlobTool } from './glob.js';
import { createGrepTool } from './grep.js';
import { createBashTool } from './bash.js';
import { createDedupTool } from './dedup.js';
import { createJunkscanTool } from './junkscan.js';
import { createTrashTool } from './trash.js';
import { createRenameTool } from './rename.js';
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
    createJunkscanTool({ jail }),
    createTrashTool({ jail, config, undo, confirm, audit }),
    createRenameTool({ jail, config, undo, confirm, audit }),
    createSkillTool(),
  ];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
