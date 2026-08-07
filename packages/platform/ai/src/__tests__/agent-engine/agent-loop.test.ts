import { describe, expect, test } from "bun:test";
import { createAgentLoop } from "../../agent-engine/agent-loop";
import { createEventEmitter } from "../../agent-engine/events";
import type { AgentTool } from "../../agent-engine/types";
import type { ChatParams, ChatResult, LLMGateway, LLMProvider, StreamChunk } from "../../llm-gateway/types";

function createGateway(turns: StreamChunk[][], requests?: ChatParams[]): LLMGateway {
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
      requests?.push(_params);
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

function createTool(execute: AgentTool["execute"]): AgentTool {
  return {
    name: "lookup",
    description: "Look something up",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    execute,
  };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe("Agent loop conformance", () => {
  test("executes directly supplied AgentTools without a ToolRegistry", async () => {
    const calls: unknown[] = [];
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "vento" } } },
        { type: "done" },
      ],
      [{ type: "content", delta: "finished" }, { type: "done" }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createTool(async (_id, args) => {
        calls.push(args);
        return { content: [{ type: "text", text: "result" }], details: {} };
      })],
    });

    const chunks = await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
    }));

    expect(calls).toEqual([{ query: "vento" }]);
    expect(chunks.some((chunk) => chunk.type === "content" && chunk.delta === "finished")).toBe(true);
  });

  test("honors block hooks and never executes the blocked tool", async () => {
    let executed = false;
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "secret" } } },
        { type: "done" },
      ],
      [{ type: "content", delta: "blocked" }, { type: "done" }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createTool(async () => {
        executed = true;
        return { content: [], details: {} };
      })],
      beforeToolCall: async ({ context }) => {
        expect(context.messages.length).toBeGreaterThan(0);
        return { block: true, reason: "policy" };
      },
    });

    await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
    }));
    expect(executed).toBe(false);
  });

  test("emits the complete tool lifecycle and applies afterToolCall overrides", async () => {
    const eventTypes: string[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => eventTypes.push(event.type));
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "done" },
      ],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      eventEmitter: emitter,
      agentTools: [createTool(async (_id, _args, _signal, update) => {
        update?.({ content: [{ type: "text", text: "half" }], details: {} });
        return { content: [{ type: "text", text: "raw" }], details: {} };
      })],
      afterToolCall: async ({ args, context, isError }) => {
        expect(args).toEqual({ query: "x" });
        expect(context.messages.length).toBeGreaterThan(0);
        expect(isError).toBe(false);
        return {
          content: [{ type: "text", text: "redacted" }],
          terminate: true,
        };
      },
    });

    await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
    }));

    expect(eventTypes).toContain("tool_execution_start");
    expect(eventTypes).toContain("tool_execution_update");
    expect(eventTypes).toContain("tool_execution_end");
  });

  test("rejects arguments that do not satisfy the AgentTool schema", async () => {
    let executed = false;
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: {} } },
        { type: "done" },
      ],
      [{ type: "done" }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createTool(async () => {
        executed = true;
        return { content: [], details: {} };
      })],
    });

    await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
    }));
    expect(executed).toBe(false);
  });

  test("denies approval-required tools unless an authorizer approves them", async () => {
    let executed = 0;
    const approvalTool: AgentTool = {
      ...createTool(async () => {
        executed += 1;
        return { content: [{ type: "text", text: "ok" }], details: {} };
      }),
      requiresApproval: true,
    };
    const deniedLoop = createAgentLoop({
      llmGateway: createGateway([
        [{ type: "tool_call_start", toolCall: { id: "denied", name: "lookup", arguments: { query: "x" } } }, { type: "done" }],
        [{ type: "done" }],
      ]),
      agentTools: [approvalTool],
    });

    await collect(deniedLoop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));
    expect(executed).toBe(0);

    const approvedLoop = createAgentLoop({
      llmGateway: createGateway([
        [{ type: "tool_call_start", toolCall: { id: "approved", name: "lookup", arguments: { query: "x" } } }, { type: "done" }],
        [{ type: "content", delta: "finished" }, { type: "done" }],
      ]),
      agentTools: [approvalTool],
      authorizeToolCall: async ({ toolCall, tool, context }) => {
        expect(toolCall.id).toBe("approved");
        expect(tool.name).toBe("lookup");
        expect(context.tenantId).toBe("tenant");
        return { approved: true };
      },
    });

    await collect(approvedLoop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));
    expect(executed).toBe(1);
  });

  test("a sequential tool forces the whole model tool batch to execute in order", async () => {
    let running = 0;
    let overlapped = false;
    const execute: AgentTool["execute"] = async () => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { content: [], details: {} };
    };
    const first = { ...createTool(execute), name: "first", executionMode: "sequential" as const };
    const second = { ...createTool(execute), name: "second" };
    const loop = createAgentLoop({
      llmGateway: createGateway([
        [
          { type: "tool_call_start", toolCall: { id: "one", name: "first", arguments: { query: "x" } } },
          { type: "tool_call_start", toolCall: { id: "two", name: "second", arguments: { query: "y" } } },
          { type: "done" },
        ],
        [{ type: "done" }],
      ]),
      agentTools: [first, second],
      toolExecutionMode: "parallel",
    });

    await collect(loop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));

    expect(overlapped).toBe(false);
  });

  test("forwards provider-neutral runtime generation controls", async () => {
    const requests: ChatParams[] = [];
    const loop = createAgentLoop({
      llmGateway: createGateway([[{ type: "done" }]], requests),
    });

    await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
      thinkingLevel: "medium",
      temperature: 0.2,
      maxTokens: 4096,
    }));

    expect(requests[0]?.thinkingLevel).toBe("medium");
    expect(requests[0]?.temperature).toBe(0.2);
    expect(requests[0]?.maxTokens).toBe(4096);
  });

  test("transformContext rewrites the messages sent to the LLM", async () => {
    const requests: ChatParams[] = [];
    const loop = createAgentLoop({
      llmGateway: createGateway([[{ type: "content", delta: "ok" }, { type: "done" }]], requests),
      transformContext: async (messages) => [
        ...messages,
        { role: "system", content: "injected by transformContext" },
      ],
    });

    await collect(loop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));

    expect(requests[0]?.messages.some((m) => m.content === "injected by transformContext")).toBe(true);
  });

  test("prepareNextTurn swaps the model used by the following request", async () => {
    const requests: ChatParams[] = [];
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "done" },
      ],
      [{ type: "content", delta: "after" }, { type: "done" }],
    ], requests);
    let firstCallToolResults = -1;
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createTool(async () => ({ content: [{ type: "text", text: "ok" }], details: {} }))],
      prepareNextTurn: async ({ toolResults }) => {
        if (firstCallToolResults === -1) firstCallToolResults = toolResults.length;
        return { model: "test/new-model" };
      },
    });

    await collect(loop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));

    // prepareNextTurn 在每轮 turn_end 后都会调用：第一轮（工具轮）有 1 个工具结果
    expect(firstCallToolResults).toBe(1);
    expect(requests[0]?.model).toBe("default");
    expect(requests[1]?.model).toBe("test/new-model");
  });

  test("getApiKey resolves a per-request API key forwarded to the provider", async () => {
    const requests: ChatParams[] = [];
    const loop = createAgentLoop({
      llmGateway: createGateway([[{ type: "done" }]], requests),
      getApiKey: (provider) => (provider === "test" ? "dynamic-key" : undefined),
    });

    await collect(loop.runStream({
      agentId: "agent",
      userId: "user",
      tenantId: "tenant",
      message: "run",
      model: "test/x",
    }));

    expect(requests[0]?.apiKey).toBe("dynamic-key");
  });

  test("addedToolNames registers dynamic tools for the following turn", async () => {
    const requests: ChatParams[] = [];
    const eventTypes: string[] = [];
    const emitter = createEventEmitter();
    emitter.on((event) => eventTypes.push(event.type));
    let dynamicCalls = 0;

    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "done" },
      ],
      [
        { type: "tool_call_start", toolCall: { id: "call-2", name: "extra", arguments: {} } },
        { type: "done" },
      ],
      [{ type: "content", delta: "done" }, { type: "done" }],
    ], requests);

    const dynamicTool: AgentTool = {
      name: "extra",
      description: "Dynamically added tool",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        dynamicCalls += 1;
        return { content: [{ type: "text", text: "extra-result" }], details: {} };
      },
    };

    const loop = createAgentLoop({
      llmGateway: gateway,
      eventEmitter: emitter,
      agentTools: [createTool(async () => ({
        content: [{ type: "text", text: "ok" }],
        details: {},
        addedToolNames: ["extra"],
      }))],
      dynamicToolResolver: async (name) => (name === "extra" ? dynamicTool : undefined),
    });

    await collect(loop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));

    expect(eventTypes).toContain("tools_added");
    const secondTurnTools = requests[1]?.tools?.map((t) => t.name) ?? [];
    expect(secondTurnTools).toContain("extra");
    // 动态工具在下一轮被实际调用并执行
    expect(dynamicCalls).toBe(1);
  });

  test("emits ai.run / ai.turn / ai.tool spans when a tracer is provided", async () => {
    const { createTracer } = await import("@ventostack/observability");
    const tracer = createTracer();
    const gateway = createGateway([
      [
        { type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } },
        { type: "done" },
      ],
      [{ type: "content", delta: "done" }, { type: "done" }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      tracer,
      agentTools: [createTool(async () => ({ content: [{ type: "text", text: "ok" }], details: {} }))],
    });

    await collect(loop.runStream({ agentId: "agent", userId: "user", tenantId: "tenant", message: "run" }));

    const spans = tracer.flush();
    const names = spans.map((s) => s.name);
    expect(names).toContain("ai.run");
    expect(names).toContain("ai.tool");
    const runSpan = spans.find((s) => s.name === "ai.run")!;
    expect(runSpan.attributes.model).toBe("default");
    expect(runSpan.attributes.agent_id).toBe("agent");
    expect(runSpan.status).toBe("ok");
    const toolSpan = spans.find((s) => s.name === "ai.tool")!;
    expect(toolSpan.attributes.tool).toBe("lookup");
    expect(toolSpan.attributes.is_error).toBe(false);
    // ai.run 应包含 turn 事件
    expect(runSpan.events.some((e) => e.name === "ai.turn")).toBe(true);
  });
});
