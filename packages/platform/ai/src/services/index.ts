/**
 * AI 服务层
 */
export { createAgentService } from "./agent";
export type { CreateAgentParams, UpdateAgentParams, AgentItem, AgentListParams } from "./agent";

export { createKnowledgeBaseCrudService } from "./knowledge-base";
export type { KnowledgeBaseItem, DocumentItem, KnowledgeBaseCrudDeps } from "./knowledge-base";

export { createConversationService } from "./conversation";
export type { ConversationItem, ConversationServiceDeps } from "./conversation";

export { createApprovalService } from "./approval";
export type { ApprovalRequest, ApprovalServiceDeps } from "./approval";

export { createProviderService } from "./provider";

export { createSkillStoreService } from "./skill-store";
export type {
  StoreSearchResult, StoreSkillDetail, StoreFileItem,
  StoreEvaluation, StoreRecommendation, SkillStoreService,
} from "./skill-store";

export { createSkillService } from "./skill";
export type { SkillItem, InstallFromStoreParams, SkillServiceDeps } from "./skill";

export { createModelConfigService } from "./model-config";
export type { ModelPurposeConfig, ModelConfigService, ModelDetail } from "./model-config";

export { createScopedKBService } from "./kb-scope";
export type { KBScope, ScopedKBItem, ScopedKBDeps } from "./kb-scope";
