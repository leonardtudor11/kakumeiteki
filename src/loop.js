import { parseToolCalls } from './toolcall.js';
import { needsCompaction, compact, countMessages } from './context.js';
import { redact } from './redact.js';

export async function runTurn({ provider, session, tools = {}, messages, userInput, signal, maxTurns = 25, onDelta, budget }) {
  messages.push({ role: 'user', content: userInput });
  session.append('user_message', { content: userInput });
  const toolNames = Object.keys(tools);
  let awaitingRepair = false;
  let lastSig = null;
  let sameCount = 0;
  let nudged = false;
  let emptyNudged = false;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (budget && needsCompaction(messages, budget)) {
        const before = countMessages(messages);
        const result = compact(messages, budget);
        if (result.compacted) {
          messages.length = 0;
          messages.push(...result.messages);
          session.append('compaction', { before, after: countMessages(messages), dropped: result.dropped });
        }
      }
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

      if (!calls.length) {
        if (!(assistant.content ?? '').trim()) {
          if (emptyNudged) {
            session.append('empty_answer', {});
            return { status: 'empty_answer' };
          }
          emptyNudged = true;
          session.append('empty_nudge', {});
          messages.push({ role: 'user', content: '[your reply was empty] Give the final answer now as plain text — one line of result plus what you verified.' });
          continue;
        }
        return { status: 'done', message: assistant };
      }

      const sig = JSON.stringify(calls.map((c) => [c.name, c.args]));
      if (sig === lastSig) sameCount++;
      else { lastSig = sig; sameCount = 1; nudged = false; }

      if (sameCount >= 3) {
        if (nudged) {
          session.append('doom_loop', { signature: sig });
          return { status: 'doom_loop' };
        }
        nudged = true;
        session.append('doom_nudge', { signature: sig });
        messages.push({
          role: 'user',
          content: '[loop guard] You have repeated the same tool call 3 times with no progress. Stop and try a different approach; if you are stuck, give your best final answer as plain text.',
        });
        continue;
      }

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
    if (err.name === 'EndpointError') {
      session.append('endpoint_error', { message: err.message });
      return { status: 'endpoint_error', error: err.message };
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
  if (!tool) return { ok: false, output: `[tool error] unknown tool "${call.name}". Available tools: ${Object.keys(tools).join(', ')}` };
  try {
    const output = await tool.run(call.args ?? {}, { signal });
    return { ok: true, output: redact(String(output)) };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ok: false, output: redact(`[tool error] ${err.message}`) };
  }
}

function toolSchemas(tools) {
  return Object.entries(tools).map(([name, tool]) => tool.schema ?? { name });
}
