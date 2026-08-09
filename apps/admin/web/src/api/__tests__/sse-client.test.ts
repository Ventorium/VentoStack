/**
 * sse-client 单元测试
 *
 * 覆盖：
 * 1. dispatchChunk 各业务事件分发（content/tool_call_start/usage/stage/sources/error）
 * 2. done 事件不触发 onDone（onDone 由 iterateStream 自然结束统一触发，防双重触发）
 * 3. streamChat 端到端：client.post → o2t iterateStream → 回调分发 → onDone 恰好一次
 */
import { describe, expect, mock, test } from "bun:test";

// Mock @/api 的 client，避免依赖浏览器环境（token store / 全局消息）
const postMock = mock(async () => ({
  error: false,
  response: new Response("", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  }),
}));

mock.module("@/api", () => ({
  client: { post: postMock },
}));

import { dispatchChunk, streamChat } from "../sse-client";
import type { AIStreamChunk, StreamCallbacks } from "../sse-client";

/** 构造一个 SSE 响应体（与后端 createSSEResponse 的 data: JSON 格式一致） */
function sseResponse(...chunks: AIStreamChunk[]): Response {
  const body = chunks
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeCallbacks(overrides: Partial<StreamCallbacks> = {}): StreamCallbacks {
  return {
    onContent: mock(() => {}),
    onToolCall: mock(() => {}),
    onUsage: mock(() => {}),
    onStage: mock(() => {}),
    onSources: mock(() => {}),
    onError: mock(() => {}),
    onDone: mock(() => {}),
    ...overrides,
  };
}

describe("dispatchChunk", () => {
  test("分发 content 增量", () => {
    const cb = makeCallbacks();
    dispatchChunk({ type: "content", delta: "你好" }, cb);
    expect(cb.onContent).toHaveBeenCalledWith("你好");
  });

  test("分发 tool_call_start", () => {
    const cb = makeCallbacks();
    dispatchChunk(
      { type: "tool_call_start", toolCall: { id: "t1", name: "kb-search" } },
      cb,
    );
    expect(cb.onToolCall).toHaveBeenCalledWith({ id: "t1", name: "kb-search" });
  });

  test("分发 usage", () => {
    const cb = makeCallbacks();
    dispatchChunk({ type: "usage", usage: { promptTokens: 10, completionTokens: 20 } }, cb);
    expect(cb.onUsage).toHaveBeenCalledWith({ promptTokens: 10, completionTokens: 20 });
  });

  test("分发 stage（深度研究阶段）", () => {
    const cb = makeCallbacks();
    dispatchChunk({ type: "stage", stage: "researching" }, cb);
    expect(cb.onStage).toHaveBeenCalledWith("researching");
  });

  test("分发 sources（引用来源）", () => {
    const cb = makeCallbacks();
    dispatchChunk(
      { type: "sources", sources: [{ title: "指南", url: "https://example.com" }] },
      cb,
    );
    expect(cb.onSources).toHaveBeenCalledWith([
      { title: "指南", url: "https://example.com" },
    ]);
  });

  test("分发 error", () => {
    const cb = makeCallbacks();
    dispatchChunk(
      { type: "error", error: { code: "TOOL_DENIED", message: "需审批", recoverable: true } },
      cb,
    );
    expect(cb.onError).toHaveBeenCalledWith({
      code: "TOOL_DENIED",
      message: "需审批",
      recoverable: true,
    });
  });

  test("done 事件不触发 onDone（由流结束统一触发，防双重触发）", () => {
    const cb = makeCallbacks();
    dispatchChunk({ type: "done" }, cb);
    expect(cb.onDone).not.toHaveBeenCalled();
  });
});

describe("streamChat", () => {
  test("完整流：分发各事件且 onDone 恰好一次", async () => {
    postMock.mockImplementation(async () => ({
      error: false,
      response: sseResponse(
        { type: "content", delta: "结果" },
        { type: "tool_call_start", toolCall: { id: "t1", name: "kb-search" } },
        { type: "stage", stage: "planning" },
        { type: "usage", usage: { promptTokens: 5, completionTokens: 7 } },
        // 后端在流末尾会下发 done chunk —— onDone 仍应只触发一次
        { type: "done" },
      ),
    }));

    const cb = makeCallbacks();
    await streamChat(
      { agentId: "a1", message: "hi" },
      cb,
    );

    expect(cb.onContent).toHaveBeenCalledWith("结果");
    expect(cb.onToolCall).toHaveBeenCalledWith({ id: "t1", name: "kb-search" });
    expect(cb.onStage).toHaveBeenCalledWith("planning");
    expect(cb.onUsage).toHaveBeenCalledWith({ promptTokens: 5, completionTokens: 7 });
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onError).not.toHaveBeenCalled();
  });

  test("HTTP 非 200 时走 onError 且不触发 onDone", async () => {
    postMock.mockImplementation(async () => ({
      error: false,
      response: new Response("", { status: 500 }),
    }));

    const cb = makeCallbacks();
    await streamChat({ agentId: "a1", message: "hi" }, cb);

    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "HTTP_500" }),
    );
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  test("client 返回 error 时走 onError", async () => {
    postMock.mockImplementation(async () => ({ error: true, response: null }));

    const cb = makeCallbacks();
    await streamChat({ agentId: "a1", message: "hi" }, cb);

    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "REQUEST_FAILED" }),
    );
  });

  test("网络异常时走 onError（recoverable）", async () => {
    postMock.mockImplementation(async () => {
      throw new Error("network down");
    });

    const cb = makeCallbacks();
    await streamChat({ agentId: "a1", message: "hi" }, cb);

    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NETWORK_ERROR", recoverable: true }),
    );
  });

  test("abort 后不触发 onError/onDone", async () => {
    postMock.mockImplementation(async () => ({
      error: false,
      response: sseResponse(
        { type: "content", delta: "部分内容" },
        { type: "done" },
      ),
    }));

    const controller = new AbortController();
    controller.abort();

    const cb = makeCallbacks();
    await streamChat({ agentId: "a1", message: "hi" }, cb, controller.signal);

    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
  });
});
