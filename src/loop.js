import { parseToolCalls } from './toolcall.js';

export async function runTurn({ provider, session, tools = {}, messages, userInput, signal, maxTurns = 25, onDelta }) {
  messages.push({ role: 'user', content: userInput });
  session.append('user_message', { content: userInput });
  const toolNames = Object.keys(tools);
  let awaitingRepair = false;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const assistant = await provider.chat({ messages, tools: toolSchemas(tools), signal, onDelta });
      session.append('assistant_message', { content: assistant.content, toolCalls: assistant.toolCalls });
      messages.push(assistant);

      const { calls, repair } = resolveCalls(assistant, toolNames);

      if (repair) {
        if (awaitingRepair) {
          session.append('protocol_failed', { message: repair });
          messages.push({ role: 'user', content: `[tool protocol error — giving up this turn] ${repair}` });
          return { status: 'protocol_failed', repair };
        }
        awaitingRepair = true;
        session.append('repair', { message: repair });
        messages.push({ role: 'user', content: `[tool protocol error] ${repair}` });
        continue;
      }
      awaitingRepair = false;

      if (!calls.length) return { status: 'done', message: assistant };

      for (const call of calls) {
        session.append('tool_call', { name: call.name, args: call.args });
        const result = await executeTool(tools, call, signal);
        session.append('tool_result', { name: call.name, ok: result.ok, output: result.output });
        messages.push({ role: 'tool', name: call.name, content: result.output });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      session.append('cancelled', {});
      return { status: 'cancelled' };
    }
    throw err;
  }

  session.append('turn_cap', { maxTurns });
  return { status: 'turn_cap' };
}

function resolveCalls(assistant, toolNames) {
  if (assistant.toolCalls?.length) return { calls: assistant.toolCalls, repair: null };
  return parseToolCalls(assistant.content, { toolNames });
}

async function executeTool(tools, call, signal) {
  const tool = tools[call.name];
  if (!tool) return { ok: false, output: `[tool error] unknown tool "${call.name}"` };
  try {
    const output = await tool.run(call.args ?? {}, { signal });
    return { ok: true, output: String(output) };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ok: false, output: `[tool error] ${err.message}` };
  }
}

function toolSchemas(tools) {
  return Object.entries(tools).map(([name, tool]) => tool.schema ?? { name });
}
