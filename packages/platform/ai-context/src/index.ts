/**
 * @ventostack/ai-context — 上下文感知模块
 *
 * 订阅 @ventostack/ai 的 Agent 事件流，把每一次模型请求装配出的上下文
 * （系统提示 / 工具 schema / 消息面各分桶）落库，并提供概览、趋势、
 * 上下文浏览器、事件、文件活动、Agent 血缘的查询 API。
 *
 * 替代原 @ventostack/ai-trace（链路追踪）；数据模型与能力在其之上扩展。
 */

export { createContextTables } from "./migrations/001_create_context_tables";
export { scopeContextRowIds } from "./migrations/002_scope_context_row_ids";
export {
  AiContextSessionModel,
  AiContextRequestModel,
  AiContextEventModel,
  AiContextNodeModel,
  AiContextFileOpModel,
} from "./models";
export {
  estimateSystemTokens,
  estimateSystemContent,
  estimateStringTokens,
  estimateComposition,
  CHARS_PER_TOKEN,
  ROLE_OVERHEAD,
} from "./shared/estimate";
export {
  CATEGORY_DEFS,
  getCategory,
  getCategoryLabel,
  getCategoryColor,
} from "./shared/categories";
export type { CategoryMeta } from "./shared/categories";
export { createContextStore } from "./services/context-store";
export type { ContextStore, UpsertSessionInput } from "./services/context-store";
export { createContextQueries } from "./services/context-queries";
export type { ContextQueries, SessionListParams } from "./services/context-queries";
export { createContextToggleService } from "./services/context-config";
export type { ContextToggleService, AgentToggleReader } from "./services/context-config";
export { createContextRecorder } from "./services/recorder";
export type { ContextRecorder, ContextRecorderDeps } from "./services/recorder";
export { applyEvent, createFoldState } from "./services/fold";
export { createContextRoutes } from "./routes/context";
export { createAiContextModule } from "./module";
export type { AiContextModule, AiContextModuleDeps } from "./module";
export type {
  ContextCategory,
  Composition,
  ActualUsage,
  ActualUsageTotals,
  SessionCounts,
  ContextEventKind,
  ContextEventRecord,
  SurfaceNode,
  RequestRecord,
  RequestBrief,
  FileOpRecord,
  FileOpKind,
  ContextSession,
  ContextSessionStatus,
  ContextDetail,
  ContextOverview,
  ActivityDay,
  ContextToggle,
  ContextEventEmitter,
} from "./shared/types";