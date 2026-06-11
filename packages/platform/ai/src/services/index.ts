/**
 * AI 服务层
 */
export { createAgentService } from "./agent";
export type {
  CreateAgentParams,
  UpdateAgentParams,
  AgentItem,
  AgentListParams,
} from "./agent";

export { createKnowledgeBaseCrudService } from "./knowledge-base";
export type {
  KnowledgeBaseItem,
  DocumentItem,
  KnowledgeBaseCrudDeps,
} from "./knowledge-base";

export { createConversationService } from "./conversation";
export type {
  ConversationItem,
  ConversationServiceDeps,
} from "./conversation";

export { createApprovalService } from "./approval";
export type {
  ApprovalRequest,
  ApprovalServiceDeps,
} from "./approval";

export { createProviderService } from "./provider";
