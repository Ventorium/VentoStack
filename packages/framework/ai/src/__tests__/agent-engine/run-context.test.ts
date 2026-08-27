import { describe, expect, test } from "bun:test";
import { createAgentLoop } from "../../agent-engine/agent-loop";
import { createEventEmitter } from "../../agent-engine/events";
import type { AgentEvent } from "../../agent-engine/events";
import type { AgentTool } from "../../agent-engine/types";
import type { ChatParams, ChatResult, LLMGateway, LLMProvider, StreamChunk } from "../../llm-gateway/types";

function createGateway(turns: StreamChunk[][]): LLMGateway {
  let index = 0;
  const provider: LLMProvider = {
    name: "test",
    capabilities: {
      functionCalling: true,
      maxContextLength: 128_000,
      supportsVision: false,
      supportsStreaming: true,
    },
    async chat(_params: ChatParams): Promise<ChatResult> {
      throw new Error("not used");
    },
    async *chatStream(_params: ChatParams): AsyncIterable<StreamChunk> {
      for (const chunk of turns[index++] ?? [{ type: "done" as const }]) yield chunk;
    },
    async listModels() {
      return [];
    },
  };
  return {
    chat: provider.chat,
    chatStream: provider.chatStream,
    getProvider: () => provider,
    getDefaultProvider: () => provider,
    listProviders: () => [provider],
  };
}

const lookupTool: AgentTool = {
  name: "lookup",
  description: "Look something up",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  execute: async () => ({ content: [{ type: "text", text: "result" }], details: {} }),
};

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe("run context injection", () => {
  test("all events carry the same run context (runId/session/agent/user/tenant)", async () => {
    const events: AgentEvent[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => events.push(event));
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "usage", usage: { promptTokens: 10, completionTokens: 5 } },
        { type: "done" },
      ],
      [{ type: "content", delta: "final" }, { type: "usage", usage: { promptTokens: 20, completionTokens: 7 } }, { type: "done" }],
    ]);
    const loop = createAgentLoop({ llmGateway: gateway, eventEmitter: emitter, agentTools: [lookupTool] });

    await collect(loop.runStream({
      agentId: "agent-1",
      userId: "user-1",
      sessionId: "session-1",
      tenantId: "tenant-1",
      message: "hello",
    }));

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.run).toBeDefined();
      expect(event.run!.runId).toHaveLength(36);
      expect(event.run!.sessionId).toBe("session-1");
      expect(event.run!.agentId).toBe("agent-1");
      expect(event.run!.userId).toBe("user-1");
      expect(event.run!.tenantId).toBe("tenant-1");
    }
    // 全部事件共享同一 runId
    const runIds = new Set(events.map((e) => e.run!.runId));
    expect(runIds.size).toBe(1);
  });

  test("agent_start carries run meta and context event carries system prompt", async () => {
    const events: AgentEvent[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => events.push(event));
    const loop = createAgentLoop({ llmGateway: createGateway([[{ type: "content", delta: "ok" }, { type: "done" }]]), eventEmitter: emitter, agentTools: [lookupTool] });

    await collect(loop.runStream({
      agentId: "agent-1",
      userId: "user-1",
      tenantId: "tenant-1",
      message: "hi",
      systemPrompt: "custom prompt",
      model: "test/model-x",
    }));

    const start = events.find((e) => e.type === "agent_start");
    expect(start?.type).toBe("agent_start");
    if (start?.type !== "agent_start") return;
    expect(start.meta?.model).toBe("test/model-x");
    expect(start.meta?.userMessage).toBe("hi");
    expect(start.meta?.toolNames).toEqual(["lookup"]);
    expect(start.meta?.researchMode).toBe(false);
    expect(start.meta?.maxIterations).toBe(10);

    const context = events.find((e) => e.type === "context");
    expect(context?.type).toBe("context");
    if (context?.type !== "context") return;
    expect(context.systemPrompt).toContain("custom prompt");
    expect(context.messages[0]?.role).toBe("system");
    expect(context.messages.at(-1)).toMatchObject({ role: "user", content: "hi" });
  });

  test("assistant message_end carries usage/model/provider/stopReason", async () => {
    const events: AgentEvent[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => events.push(event));
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "usage", usage: { promptTokens: 10, completionTokens: 5 } },
        { type: "done" },
      ],
      [{ type: "content", delta: "final" }, { type: "usage", usage: { promptTokens: 20, completionTokens: 7 } }, { type: "done" }],
    ]);
    const loop = createAgentLoop({ llmGateway: gateway, eventEmitter: emitter, agentTools: [lookupTool] });

    await collect(loop.runStream({
      agentId: "agent-1",
      userId: "user-1",
      tenantId: "tenant-1",
      message: "hello",
      model: "test/model-x",
    }));

    const assistantEnds = events.filter(
      (e) => e.type === "message_end" && e.message.role === "assistant",
    );
    expect(assistantEnds.length).toBe(2);
    const first = assistantEnds[0];
    const second = assistantEnds[1];
    if (first?.type !== "message_end" || second?.type !== "message_end") return;
    expect(first.message.stopReason).toBe("tool_calls");
    expect(first.message.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(second.message.stopReason).toBe("stop");
    expect(second.message.usage).toEqual({ promptTokens: 20, completionTokens: 7, totalTokens: 27 });
    for (const end of [first, second]) {
      expect(end.message.model).toBe("test/model-x");
      expect(end.message.provider).toBe("test");
    }
  });

  test("concurrent runs receive distinct runIds", async () => {
    const events: AgentEvent[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => events.push(event));
    // 每个运行 2 轮，交错消费制造并发
    const gateway = createGateway([
      [{ type: "content", delta: "a1" }, { type: "done" }],
      [{ type: "content", delta: "b1" }, { type: "done" }],
    ]);
    const loop = createAgentLoop({ llmGateway: gateway, eventEmitter: emitter, agentTools: [] });

    const iter1 = loop.runStream({ agentId: "a", userId: "u1", tenantId: "t1", message: "one" });
    const iter2 = loop.runStream({ agentId: "b", userId: "u2", tenantId: "t1", message: "two" });
    await Promise.all([collect(iter1), collect(iter2)]);

    const runIdsByAgent = new Map<string, string>();
    for (const event of events) {
      if (!event.run?.agentId || !event.run.runId) continue;
      const existing = runIdsByAgent.get(event.run.agentId);
      if (existing) {
        expect(existing).toBe(event.run.runId);
      } else {
        runIdsByAgent.set(event.run.agentId, event.run.runId);
      }
    }
    expect(runIdsByAgent.size).toBe(2);
    expect(new Set(runIdsByAgent.values()).size).toBe(2);
  });
});
