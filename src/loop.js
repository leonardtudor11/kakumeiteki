export async function runTurn({ provider, session, tools = {}, messages, userInput, signal, maxTurns = 25, onDelta }) {
  messages.push({ role: 'user', content: userInput });
  session.append('user_message', { content: userInput });

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const assistant = await provider.chat({ messages, tools: toolSchemas(tools), signal, onDelta });
      session.append('assistant_message', { content: assistant.content, toolCalls: assistant.toolCalls });
      messages.push(assistant);
      if (!assistant.toolCalls.length) return { status: 'done', message: assistant };

      for (const call of assistant.toolCalls) {
        session.append('tool_call', { name: call.name, args: call.args });
        const result = await executeTool(tools, call);
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

async function executeTool(tools, call) {
  const tool = tools[call.name];
  if (!tool) return { ok: false, output: `[tool error] unknown tool "${call.name}"` };
  try {
    const output = await tool.run(call.args ?? {});
    return { ok: true, output: String(output) };
  } catch (err) {
    return { ok: false, output: `[tool error] ${err.message}` };
  }
}

function toolSchemas(tools) {
  return Object.entries(tools).map(([name, tool]) => tool.schema ?? { name });
}
