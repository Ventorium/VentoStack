/**
 * AI 模块错误定义
 * 所有错误类统一支持 cause 链，与 WorkflowError 模式一致
 */
import { VentoStackError } from "@ventostack/core";

export class AIGatewayError extends VentoStackError {
  readonly provider?: string;
  readonly model?: string;
  readonly cause?: Error;
  constructor(
    message: string,
    code: number,
    errorCode: string,
    opts?: { provider?: string; model?: string; cause?: Error },
  ) {
    super(message, code, errorCode);
    this.name = "AIGatewayError";
    if (opts?.provider) this.provider = opts.provider;
    if (opts?.model) this.model = opts.model;
    if (opts?.cause) this.cause = opts.cause;
  }
}

export class KnowledgeBaseError extends VentoStackError {
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "KnowledgeBaseError";
    if (cause) this.cause = cause;
  }
}

export class SandboxError extends VentoStackError {
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "SandboxError";
    if (cause) this.cause = cause;
  }
}

export class ToolExecutionError extends VentoStackError {
  readonly toolName?: string;
  readonly cause?: Error;
  constructor(
    message: string,
    code: number,
    errorCode: string,
    toolName?: string,
    cause?: Error,
  ) {
    super(message, code, errorCode);
    this.name = "ToolExecutionError";
    if (toolName) this.toolName = toolName;
    if (cause) this.cause = cause;
  }
}

export const aiErrors = {
  llmTimeout: (provider: string) =>
    new AIGatewayError("服务暂时不可用", 504, "AI_LLM_TIMEOUT", { provider }),
  llmRateLimited: (provider: string) =>
    new AIGatewayError("请求过于频繁", 429, "AI_LLM_RATE_LIMITED", {
      provider,
    }),
  llmAllFailed: () =>
    new AIGatewayError("服务暂时不可用", 502, "AI_LLM_ALL_FAILED"),
  kbNotFound: () =>
    new KnowledgeBaseError("知识库不存在", 404, "AI_KB_NOT_FOUND"),
  kbFileNotFound: () =>
    new KnowledgeBaseError("文件不存在", 404, "AI_KB_FILE_NOT_FOUND"),
  kbIndexFailed: () =>
    new KnowledgeBaseError("索引构建失败", 500, "AI_KB_INDEX_FAILED"),
  sandboxTimeout: () =>
    new SandboxError("代码执行超时", 408, "AI_SANDBOX_TIMEOUT"),
  sandboxDenied: () => new SandboxError("权限不足", 403, "AI_SANDBOX_DENIED"),
  toolNotFound: (name: string) =>
    new ToolExecutionError(
      `工具 ${name} 不存在`,
      404,
      "AI_TOOL_NOT_FOUND",
      name,
    ),
  toolTimeout: (name: string) =>
    new ToolExecutionError(
      `工具 ${name} 执行超时`,
      408,
      "AI_TOOL_TIMEOUT",
      name,
    ),
  toolApprovalRequired: (name: string) =>
    new ToolExecutionError(
      `工具 ${name} 需要审批`,
      403,
      "AI_TOOL_APPROVAL_REQUIRED",
      name,
    ),
  promptInjection: () =>
    new AIGatewayError("检测到不安全的输入", 400, "AI_PROMPT_INJECTION"),
  maxIterationsExceeded: () =>
    new AIGatewayError("超过最大迭代次数", 400, "AI_MAX_ITERATIONS"),
  tokenBudgetExceeded: () =>
    new AIGatewayError("今日对话额度已用完", 429, "AI_TOKEN_BUDGET"),
  queueFull: () =>
    new AIGatewayError(
      "请求队列已满，请稍后重试",
      503,
      "AI_QUEUE_FULL",
    ),
  queueTimeout: () =>
    new AIGatewayError("请求排队超时", 504, "AI_QUEUE_TIMEOUT"),
};
