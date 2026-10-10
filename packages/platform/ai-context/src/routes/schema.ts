/**
 * 上下文洞察路由的 OpenAPI Schema 定义
 *
 * 使 /api/ai/context 路由纳入 OpenAPI 契约，前端通过 o2t 生成类型，
 * 避免手写业务接口（apps/admin/web/src/api/schema.ts 由 o2t 生成，勿手改）。
 *
 * 可空约定：框架用「不声明 required」表达可空（类型推导为 `T | undefined`），
 * SchemaField 无 nullable 字段，勿引入。
 */

import type { RouteSchemaConfig, SchemaField } from "@ventostack/core";

/** 上下文洞察路由统一 OpenAPI 标签 */
export const CONTEXT_TAG = "ai-context";

/** 可空整数（不声明 required → 推导为 number | undefined） */
function optInt(description: string): SchemaField {
  return { type: "int", description };
}

/** 可空字符串 */
function optStr(description: string): SchemaField {
  return { type: "string", description };
}

/** 上下文构成（七分桶 + 合计） */
const compositionProperties: Record<string, SchemaField> = {
  system: { type: "int", description: "系统提示 token" },
  tools: { type: "int", description: "工具 schema token" },
  user: { type: "int", description: "用户消息 token" },
  inject: { type: "int", description: "注入上下文 token" },
  skill: { type: "int", description: "技能内容 token" },
  assistant: { type: "int", description: "助手回复 token" },
  tool: { type: "int", description: "工具结果 token" },
  total: { type: "int", description: "七项合计" },
};

const compositionSchema: SchemaField = {
  type: "object",
  properties: compositionProperties,
  description: "上下文构成（估算 token）",
};

const usageProperties: Record<string, SchemaField> = {
  uncached: { type: "int", description: "未命中缓存的输入 token" },
  cacheRead: { type: "int", description: "缓存命中 token" },
  cacheWrite: { type: "int", description: "缓存写入 token" },
  output: { type: "int", description: "输出 token" },
};

const countsProperties: Record<string, SchemaField> = {
  turns: { type: "int", description: "轮次数" },
  steps: { type: "int", description: "模型请求步数" },
  injects: { type: "int", description: "注入次数" },
  compactions: { type: "int", description: "压缩次数" },
  prunes: { type: "int", description: "裁剪次数" },
  skills: { type: "int", description: "技能数" },
  humanInputs: { type: "int", description: "用户输入次数" },
  answers: { type: "int", description: "助手回复次数" },
};

const categoryEnum = [
  "system",
  "tools",
  "user",
  "inject",
  "skill",
  "assistant",
  "tool",
] as const;

/** 会话项 */
export const contextSessionSchema: SchemaField = {
  type: "object",
  properties: {
    id: { type: "string", description: "记录主键" },
    tenantId: { type: "string", description: "租户（由认证上下文确定，客户端无需传入）" },
    sessionId: { type: "string", description: "会话 ID" },
    title: optStr("会话标题（取首条用户消息）"),
    agentId: optStr("Agent ID"),
    agentName: optStr("Agent 名称"),
    userId: optStr("用户 ID"),
    userName: optStr("用户名称"),
    parentRunId: optStr("父 run（子 Agent 血缘）"),
    runCount: { type: "int", description: "run 次数" },
    model: optStr("模型 ID"),
    provider: optStr("提供方 ID"),
    contextWindow: optInt("模型上下文窗口"),
    status: {
      type: "string",
      enum: ["running", "success", "error", "aborted"],
      description: "会话状态",
    },
    counts: { type: "object", properties: countsProperties, description: "会话级计数" },
    current: compositionSchema,
    usage: { type: "object", properties: usageProperties, description: "累计真实用量" },
    durationMs: { type: "int", description: "累计耗时毫秒" },
    lastUser: optStr("最近一条用户消息预览"),
    startedAt: { type: "string", description: "开始时间" },
    endedAt: optStr("结束时间"),
  },
  description: "上下文会话",
};

/** 请求快照 */
export const contextRequestSchema: SchemaField = {
  type: "object",
  properties: {
    id: { type: "string", description: "请求记录 ID" },
    sessionId: { type: "string", description: "会话 ID" },
    seq: { type: "int", description: "序号" },
    turnIndex: { type: "int", description: "所属轮次" },
    model: optStr("模型 ID"),
    provider: optStr("提供方 ID"),
    messageCount: { type: "int", description: "本次请求携带的消息数" },
    contextWindow: optInt("上下文窗口"),
    composition: compositionSchema,
    actual: {
      type: "object",
      description: "提供方上报真实用量；未上报时整体为 undefined（不伪造 0）",
      properties: {
        uncachedInputTokens: { type: "int", description: "未命中缓存输入" },
        outputTokens: { type: "int", description: "输出" },
        cacheReadTokens: { type: "int", description: "缓存命中" },
        cacheWriteTokens: { type: "int", description: "缓存写入" },
      },
    },
    durationMs: optInt("本次请求耗时"),
    brief: {
      type: "object",
      description: "步骤简报（用户提问 / 中间注入 / 回复预览）",
      properties: {
        user: { type: "string", description: "本步用户提问" },
        incoming: {
          type: "array",
          items: { type: "string" },
          description: "本步注入内容",
        },
        response: { type: "string", description: "本步回复预览" },
      },
    },
    createdAt: { type: "string", description: "创建时间" },
  },
  description: "每次模型请求的上下文快照",
};

/** 上下文事件 */
export const contextEventSchema: SchemaField = {
  type: "object",
  properties: {
    id: { type: "string", description: "事件 ID" },
    sessionId: { type: "string", description: "会话 ID" },
    seq: { type: "int", description: "序号" },
    kind: {
      type: "string",
      enum: ["inject", "compact", "prune", "switch"],
      description: "事件类型",
    },
    producer: { type: "string", description: "产生者" },
    deltaTokens: { type: "int", description: "净变化（压缩为负数）" },
    turnIndex: { type: "int", description: "所属轮次" },
    detail: { type: "object", description: "事件明细" },
    createdAt: { type: "string", description: "创建时间" },
  },
  description: "上下文变更事件",
};

/** 上下文活跃面节点 */
export const contextNodeSchema: SchemaField = {
  type: "object",
  properties: {
    id: { type: "string", description: "节点 ID" },
    sessionId: { type: "string", description: "会话 ID" },
    seq: { type: "int", description: "序号" },
    category: { type: "string", enum: categoryEnum, description: "上下文分类" },
    name: { type: "string", description: "元素名称" },
    tokens: { type: "int", description: "估算 token" },
    preview: { type: "string", description: "预览（折叠空白并截断）" },
    content: optStr("完整内容（超长截断）"),
    images: { type: "int", description: "图片块数" },
    goneAtSeq: optInt("被哪个事件 seq 移走；undefined = 仍存活"),
    createdAt: { type: "string", description: "创建时间" },
  },
  description: "上下文组成元素",
};

/** 文件操作 */
export const contextFileOpSchema: SchemaField = {
  type: "object",
  properties: {
    id: { type: "string", description: "记录 ID" },
    sessionId: { type: "string", description: "会话 ID" },
    seq: { type: "int", description: "序号" },
    path: { type: "string", description: "文件路径" },
    kind: { type: "string", enum: ["read", "write", "search"], description: "操作类型" },
    tool: { type: "string", description: "调用的工具名" },
    err: { type: "boolean", description: "是否出错" },
    added: { type: "int", description: "新增行数" },
    removed: { type: "int", description: "删除行数" },
    detail: optStr("操作明细"),
    createdAt: { type: "string", description: "创建时间" },
  },
  description: "文件操作",
};

/** 每日账目 */
const activityDaySchema: SchemaField = {
  type: "object",
  properties: {
    day: { type: "string", description: "日期 YYYY-MM-DD" },
    tokens: { type: "int", description: "当日 token 合计" },
    requests: { type: "int", description: "当日请求数" },
    cost: optInt("当日成本；未接入计价时为 undefined"),
  },
  description: "每日账目",
};

/** 概览 */
export const contextOverviewSchema: SchemaField = {
  type: "object",
  properties: {
    sessionCount: { type: "int", description: "会话数" },
    requestCount: { type: "int", description: "模型请求数" },
    billedTokens: { type: "int", description: "计费 token 合计" },
    estimatedCost: optInt("估算成本；未接入计价时为 undefined"),
    cacheHitRate: optInt("缓存命中率；无缓存数据时为 undefined（不伪造 0）"),
    days: { type: "array", items: activityDaySchema, description: "每日账目" },
    composition: compositionSchema,
  },
  description: "上下文概览",
};

/** 会话详情 */
export const contextDetailSchema: SchemaField = {
  type: "object",
  properties: {
    session: contextSessionSchema,
    requests: { type: "array", items: contextRequestSchema, description: "请求快照序列" },
    events: { type: "array", items: contextEventSchema, description: "上下文事件" },
    nodes: { type: "array", items: contextNodeSchema, description: "活跃面节点" },
    droppedNodes: { type: "int", description: "因保留窗口被裁剪的节点数" },
    archive: { type: "array", items: contextNodeSchema, description: "归档（已移走）节点" },
    archiveFloor: optInt("归档下界 seq"),
    fileOps: { type: "array", items: contextFileOpSchema, description: "文件操作" },
    rev: { type: "int", description: "详情修订号" },
  },
  description: "会话上下文详情",
};

/** 采集开关 */
/** 概览查询参数 */
export const overviewQuery: Record<string, SchemaField> = {
  days: { type: "int", default: 7, min: 1, max: 365, description: "统计天数（1—365）" },
  userId: { type: "string", description: "按用户收窄统计范围；缺省统计租户内全部用户", max: 64 },
};

/** 会话列表查询参数 */
export const sessionListQuery: Record<string, SchemaField> = {
  page: { type: "int", default: 1, description: "页码" },
  pageSize: { type: "int", default: 20, description: "每页数量" },
  keyword: { type: "string", description: "标题 / 会话 ID / 最近消息模糊搜索", max: 128 },
  agentId: { type: "string", description: "按 Agent 过滤" },
  userId: { type: "string", description: "按用户过滤" },
  startTime: { type: "string", description: "开始时间（ISO 8601）" },
  endTime: { type: "string", description: "结束时间（ISO 8601）" },
  sort: {
    type: "string",
    enum: ["recent", "tokens", "context"],
    default: "recent",
    description: "排序：最近 / token / 上下文规模",
  },
};

/** 构造带 summary/tags 的路由 schema */
export function routeDoc(
  summary: string,
  extra?: Partial<RouteSchemaConfig>,
): RouteSchemaConfig {
  return {
    openapi: { summary, tags: [CONTEXT_TAG] },
    ...extra,
  };
}