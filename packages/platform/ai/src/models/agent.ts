import { column, defineModel } from "@ventostack/database";

export const AiAgentModel = defineModel(
  "ai_agent",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    description: column.text({ nullable: true }),
    avatar: column.varchar({ length: 512, nullable: true }),
    type: column.varchar({ length: 32, default: "chatbot" }),
    system_prompt: column.text(),
    model: column.varchar({ length: 64 }),
    tools: column.json({ nullable: true }),
    knowledge_base_ids: column.json({ nullable: true }),
    memory_config: column.json({ nullable: true }),
    config: column.json({ nullable: true }),
    max_iterations: column.int({ default: 10 }),
    max_tokens_per_turn: column.int({ default: 4096 }),
    tenant_id: column.varchar({ length: 36 }),
    created_by: column.varchar({ length: 36 }),
    status: column.varchar({ length: 16, default: "draft" }),
    is_public: column.boolean({ default: false }),
  },
  { timestamps: true },
);
