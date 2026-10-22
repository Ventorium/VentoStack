import { column, defineModel } from '@ventostack/database';

export const AiAgentModel = defineModel(
  'ai_agent',
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    description: column.text({ nullable: true }),
    welcome_message: column.varchar({ length: 500, nullable: true }),
    avatar: column.varchar({ length: 512, nullable: true }),
    type: column.varchar({ length: 32, default: 'chatbot' }),
    system_prompt: column.text(),
    model: column.textArray(),
    tools: column.json({ nullable: true }),
    knowledge_base_ids: column.json({ nullable: true }),
    skill_ids: column.json({ nullable: true }),
    mcp_server_ids: column.json({ nullable: true }),
    model_overrides: column.json({ nullable: true }),
    memory_config: column.json({ nullable: true }),
    config: column.json({ nullable: true }),
    max_iterations: column.int({ default: 100 }),
    max_tokens_per_turn: column.int({ default: 4096 }),
    tenant_id: column.varchar({ length: 36 }),
    created_by: column.varchar({ length: 36 }),
    status: column.varchar({ length: 16, default: 'draft' }),
    is_public: column.boolean({ default: false }),
    requires_virtual_environment: column.boolean({ default: false }),
    network_enabled: column.boolean({ default: true }),
    // 上下文采集开关：仅管理员可见的调试能力，默认关闭（显式开启才落库）
    context_collection_enabled: column.boolean({ default: false }),
    sandbox_id: column.varchar({ length: 128, nullable: true }),
  },
  { timestamps: true },
);
