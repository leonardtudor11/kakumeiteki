import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createLsTool } from './ls.js';
import { createGlobTool } from './glob.js';
import { createGrepTool } from './grep.js';

export function createTools({ jail }) {
  const tools = [
    createReadTool({ jail }),
    createWriteTool({ jail }),
    createEditTool({ jail }),
    createLsTool({ jail }),
    createGlobTool({ jail }),
    createGrepTool({ jail }),
  ];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
