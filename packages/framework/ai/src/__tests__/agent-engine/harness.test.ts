import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentHarness } from "../../agent-engine/harness";
import { createJsonlSessionStorage } from "../../session/jsonl-storage";
import { createSession } from "../../session/session";
import type { SkillManager } from "../../skills/types";
import type { ChatParams, ChatResult, LLMGateway, LLMProvider, StreamChunk } from "../../llm-gateway/types";

function createGateway(turns: StreamChunk[][], requests: ChatParams[]): LLMGateway {
  let index = 0;
  const provider: LLMProvider = {
    name: "test",
    capabilities: { functionCalling: true, maxContextLength: 128_000, supportsVision: false, supportsStreaming: true },
    async chat(_params: ChatParams): Promise<ChatResult> {
      return {
        content: "compacted history",
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: "stop",
      };
    },
    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      requests.push(params);
      for (const chunk of turns[index++] ?? [{ type: "done" as const }]) yield chunk;
    },
    async listModels() { return []; },
  };
  return {
    chat: provider.chat,
    chatStream: provider.chatStream,
    getProvider: () => provider,
    getDefaultProvider: () => provider,
    listProviders: () => [provider],
  };
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* consume */ }
}

describe("Agent harness conformance", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-harness-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("uses the shared tool loop, injects skills, emits events, and persists the transcript", async () => {
    const storage = await createJsonlSessionStorage(join(directory, "session.jsonl"), { sessionId: "harness-test" });
    const session = createSession(storage);
    const requests: ChatParams[] = [];
    const events: string[] = [];
    let executions = 0;
    const skillManager: SkillManager = {
      getSkills: () => [{ name: "review", description: "Review code", content: "Always inspect tests.", filePath: "/skills/review/SKILL.md" }],
      getSkill: () => undefined,
      reload: async () => ({ skills: [], diagnostics: [] }),
      addSkill: () => {},
      removeSkill: () => false,
      getDiagnostics: () => [],
    };
    const harness = createAgentHarness({
      gateway: createGateway([
        [{ type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "vento" } } }, { type: "done" }],
        [{ type: "content", delta: "complete" }, { type: "done" }],
      ], requests),
      session,
      skillManager,
      tools: [{
        name: "lookup",
        description: "Lookup",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        execute: async () => {
          executions += 1;
          return { content: [{ type: "text", text: "found" }], details: {} };
        },
      }],
    });
    harness.on((event) => events.push(event.type));

    await drain(harness.prompt("start"));

    expect(executions).toBe(1);
    expect(requests[0]?.messages[0]?.content).toContain("review");
    expect(events).toContain("tool_execution_start");
    const context = await session.buildContext();
    expect(context.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(context.messages.at(-1)?.content).toBe("complete");
  });

  test("continues with queued follow-up messages", async () => {
    const storage = await createJsonlSessionStorage(join(directory, "follow-up.jsonl"), { sessionId: "follow-up" });
    const requests: ChatParams[] = [];
    const harness = createAgentHarness({
      gateway: createGateway([
        [{ type: "content", delta: "first" }, { type: "done" }],
        [{ type: "content", delta: "second" }, { type: "done" }],
      ], requests),
      session: createSession(storage),
    });
    harness.followUp({ role: "user", content: "continue" });

    await drain(harness.prompt("start"));

    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.some((message) => message.role === "user" && message.content === "continue")).toBe(true);
  });

  test("automatically compacts the active branch before it exceeds the model window", async () => {
    const storage = await createJsonlSessionStorage(join(directory, "compact.jsonl"), { sessionId: "compact" });
    const session = createSession(storage);
    for (let index = 0; index < 24; index++) {
      await session.appendMessage({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `${index}:${"x".repeat(500)}`,
        timestamp: Date.now(),
      });
    }
    const requests: ChatParams[] = [];
    const gateway = createGateway([[{ type: "content", delta: "after compaction" }, { type: "done" }]], requests);
    gateway.getDefaultProvider().capabilities.maxContextLength = 3_000;
    const harness = createAgentHarness({
      gateway,
      session,
      compactionSettings: { enabled: true, reserveTokens: 1_000, keepRecentTokens: 500 },
    });

    await drain(harness.prompt("continue"));

    const entries = await session.getEntries();
    expect(entries.some((entry) => entry.type === "compaction" && entry.summary === "compacted history")).toBe(true);
    expect(requests[0]?.messages.some((message) => message.content.includes("[Compacted Summary]"))).toBe(true);
  });

  test("restores model and active tools from session state", async () => {
    const storage = await createJsonlSessionStorage(join(directory, "restore.jsonl"), { sessionId: "restore" });
    const session = createSession(storage);
    await session.appendModelChange("openai", "restored-model");
    await session.appendActiveToolsChange(["lookup"]);
    await session.appendThinkingLevelChange("high");
    const requests: ChatParams[] = [];
    const harness = createAgentHarness({
      gateway: createGateway([[{ type: "done" }]], requests),
      session,
      tools: [{ name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: {} }) }],
    });

    await drain(harness.prompt("continue"));

    expect(harness.getModelId()).toBe("openai/restored-model");
    expect(harness.getActiveToolNames()).toEqual(["lookup"]);
    expect(harness.getThinkingLevel()).toBe("high");
    expect(requests[0]?.model).toBe("openai/restored-model");
    expect(requests[0]?.thinkingLevel).toBe("high");
  });
});
