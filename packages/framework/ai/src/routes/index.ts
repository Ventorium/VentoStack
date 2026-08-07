/**
 * AI 模块路由
 */
export { createKnowledgeBaseRoutes } from "./knowledge-base";
export { createAgentRoutes } from "./agent";
export { createChatRoutes } from "./chat";
export { createConversationRoutes } from "./conversation";
export { createApprovalRoutes } from "./approval";
export { createHealthRoutes } from "./health";
export { createProviderRoutes } from "./provider";
export { createSkillRoutes } from "./skill";
export type { AgentCrudService } from "./agent";
export type { ConversationService } from "./chat";
export type { ConversationCrudService } from "./conversation";
export type { ApprovalCrudService } from "./approval";
export type { HealthCheckDeps } from "./health";
