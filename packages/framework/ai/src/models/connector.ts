import { column, defineModel } from "@ventostack/database";

/**
 * AI 连接器目录（Connectors）
 *
 * 平台预设的服务目录：每项声明一个第三方服务的接入方式
 * （官方 Remote MCP 优先，二期可扩展 gateway/internal）。
 * OAuth client_secret 不存本表，由环境变量提供（见 auth_template 的 secret_env）。
 */
export const AiConnectorCatalogModel = defineModel(
  "ai_connector_catalog",
  {
    id: column.varchar({ primary: true, length: 36 }),
    /** 服务标识，全局唯一，如 feishu / notion / github */
    kind: column.varchar({ length: 64 }),
    name: column.varchar({ length: 128 }),
    description: column.text({ nullable: true }),
    /** office | knowledge | productivity | dev | search | media */
    category: column.varchar({ length: 32 }),
    /** 图标 URL 或内置图标 key */
    icon: column.varchar({ length: 512, nullable: true }),
    /** oauth2 | api_key | personal_token | custom_fields */
    auth_type: column.varchar({ length: 32 }),
    /**
     * 授权模板 JSON：
     * - oauth2: { authorize_url, token_url, client_id, client_secret_env, scope, userinfo_url? }
     * - api_key / personal_token: { fields: [{ key, label, secret, placeholder, help? }] }
     * - custom_fields: 同 api_key，字段由服务自定义
     */
    auth_template: column.json({ nullable: true }),
    /** remote（官方 MCP URL）| gateway | internal；一期仅 remote */
    transport: column.varchar({ length: 16, default: "remote" }),
    /** remote 模式必填：官方 MCP 端点 */
    mcp_url: column.varchar({ length: 1024, nullable: true }),
    /** 平台内置目录项（seed 写入）= true */
    built_in: column.boolean({ default: false }),
    /** 预留：版本/套餐门控 */
    required_plan: column.varchar({ length: 32, nullable: true }),
    sort_order: column.int({ default: 0 }),
    enabled: column.boolean({ default: true }),
    tenant_id: column.varchar({ length: 36, default: "default" }),
  },
  { timestamps: true },
);

/** 连接器绑定：谁连接了什么（scope=user 个人账号；scope=tenant 租户共享） */
export const AiConnectorBindingModel = defineModel(
  "ai_connector_binding",
  {
    id: column.varchar({ primary: true, length: 36 }),
    connector_id: column.varchar({ length: 36 }),
    /** tenant | user */
    scope: column.varchar({ length: 16 }),
    /** scope=user 时为 user_id；scope=tenant 时为 tenant_id（即 tenant_id 列本身） */
    owner_id: column.varchar({ length: 36, nullable: true }),
    /** 用户可见名，如 "我的 Notion" */
    display_name: column.varchar({ length: 128, nullable: true }),
    /** pending | connected | expired | revoked | error */
    status: column.varchar({ length: 16, default: "pending" }),
    /**
     * 加密存储的凭证（复用 credentialEncryptor 对整段 JSON 加密）：
     * - oauth2: { access_token, refresh_token?, expires_at?, token_type, scope? }
     * - api_key/personal_token: { [key]: value }（key 来自 auth_template.fields）
     */
    credentials: column.text({ nullable: true }),
    /** 脱敏的账号提示（如 "u***@example.com"），绝不存完整凭证 */
    account_hint: column.varchar({ length: 128, nullable: true }),
    last_refresh_at: column.timestamp({ nullable: true }),
    last_error: column.text({ nullable: true }),
    tenant_id: column.varchar({ length: 36, default: "default" }),
  },
  { timestamps: true },
);
