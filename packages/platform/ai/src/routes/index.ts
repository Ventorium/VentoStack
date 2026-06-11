/**
 * AI 模块路由
 */
export { createKnowledgeBaseRoutes } from "./knowledge-base";
export { createAgentRoutes } from "./agent";
export { createChatRoutes } from "./chat";
export type { AgentCrudService, ConversationService } from "./agent";
export type { ConversationService as ChatConversationService } from "./chat";
