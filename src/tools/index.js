import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';

export function createTools({ jail }) {
  const tools = [createReadTool({ jail }), createWriteTool({ jail }), createEditTool({ jail })];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
