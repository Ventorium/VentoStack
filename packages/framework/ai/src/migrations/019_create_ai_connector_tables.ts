import type { Migration } from '@ventostack/database';

/**
 * AI 连接器（Connectors）
 *
 * - ai_connector_catalog：平台预设的服务目录（remote MCP 优先）
 * - ai_connector_binding：连接绑定（scope=user 个人 / scope=tenant 租户共享）
 * - ai_mcp_server 增加 connector_binding_id / origin 两列，连接器托管的 MCP 复用现有执行面
 * - seed 内置目录：飞书 / Notion / GitHub（P0，官方 Remote MCP）
 *
 * OAuth client_secret 不入库，由环境变量提供（auth_template.client_secret_env）。
 */
export const createAiConnectorTables: Migration = {
  name: '019_create_ai_connector_tables',
  up: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_connector_catalog (
        id VARCHAR(36) PRIMARY KEY,
        kind VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        category VARCHAR(32) NOT NULL,
        icon VARCHAR(512),
        auth_type VARCHAR(32) NOT NULL,
        auth_template JSON,
        transport VARCHAR(16) NOT NULL DEFAULT 'remote',
        mcp_url VARCHAR(1024),
        built_in BOOLEAN NOT NULL DEFAULT FALSE,
        required_plan VARCHAR(32),
        sort_order INT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_connector_catalog_kind
      ON ai_connector_catalog(kind)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_connector_binding (
        id VARCHAR(36) PRIMARY KEY,
        connector_id VARCHAR(36) NOT NULL REFERENCES ai_connector_catalog(id) ON DELETE CASCADE,
        scope VARCHAR(16) NOT NULL,
        owner_id VARCHAR(36),
        display_name VARCHAR(128),
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        credentials TEXT,
        account_hint VARCHAR(128),
        last_refresh_at TIMESTAMP,
        last_error TEXT,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 同一 connector 下，同一 scope+owner 只允许一条绑定（user 维度去重）
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_connector_binding_unique
      ON ai_connector_binding(connector_id, scope, COALESCE(owner_id, tenant_id), tenant_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_connector_binding_owner
      ON ai_connector_binding(scope, owner_id, tenant_id)
    `);

    // ai_mcp_server：连接器托管列
    await executor(`
      ALTER TABLE ai_mcp_server
      ADD COLUMN IF NOT EXISTS connector_binding_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS origin VARCHAR(16) NOT NULL DEFAULT 'custom'
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_mcp_server_binding
      ON ai_mcp_server(connector_binding_id)
    `);

    // ── 内置目录 seed（幂等，按 kind 冲突忽略）──
    const seed = async (
      id: string,
      kind: string,
      name: string,
      description: string,
      category: string,
      authType: string,
      authTemplate: unknown,
      mcpUrl: string | null,
      sortOrder: number,
    ) => {
      await executor(
        `INSERT INTO ai_connector_catalog
           (id, kind, name, description, category, auth_type, auth_template, transport, mcp_url, built_in, sort_order, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'remote',$8,TRUE,$9,'default')
         ON CONFLICT (kind) DO NOTHING`,
        [id, kind, name, description, category, authType, JSON.stringify(authTemplate), mcpUrl, sortOrder],
      );
    };

    await seed(
      'c0ffee00-0000-4000-8000-000000000001',
      'feishu',
      '飞书',
      '连接飞书账号，在对话中读写飞书文档、多维表格与消息。',
      'office',
      'oauth2',
      {
        authorize_url: 'https://open.feishu.cn/open-apis/authen/v1/authorize',
        token_url: 'https://open.feishu.cn/open-apis/authen/v1/token',
        scope: 'offline_access',
        client_id_env: 'CONNECTOR_FEISHU_CLIENT_ID',
        client_secret_env: 'CONNECTOR_FEISHU_CLIENT_SECRET',
        userinfo_url: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
      },
      'https://open.feishu.cn/mcp',
      1,
    );

    await seed(
      'c0ffee00-0000-4000-8000-000000000002',
      'notion',
      'Notion',
      '连接 Notion 工作区，搜索/读取页面与数据库。',
      'knowledge',
      'oauth2',
      {
        authorize_url: 'https://api.notion.com/v1/oauth/authorize',
        token_url: 'https://api.notion.com/v1/oauth/token',
        scope: 'read_content',
        client_id_env: 'CONNECTOR_NOTION_CLIENT_ID',
        client_secret_env: 'CONNECTOR_NOTION_CLIENT_SECRET',
      },
      'https://mcp.notion.com/mcp',
      2,
    );

    await seed(
      'c0ffee00-0000-4000-8000-000000000003',
      'github',
      'GitHub',
      '连接 GitHub 账号，在对话中检索仓库、Issue 与 PR。',
      'dev',
      'oauth2',
      {
        authorize_url: 'https://github.com/login/oauth/authorize',
        token_url: 'https://github.com/login/oauth/access_token',
        scope: 'read:user repo',
        client_id_env: 'CONNECTOR_GITHUB_CLIENT_ID',
        client_secret_env: 'CONNECTOR_GITHUB_CLIENT_SECRET',
        userinfo_url: 'https://api.github.com/user',
      },
      'https://api.githubcopilot.com/mcp/',
      3,
    );
  },

  down: async (executor) => {
    await executor('DROP TABLE IF EXISTS ai_connector_binding CASCADE');
    await executor('DROP TABLE IF EXISTS ai_connector_catalog CASCADE');
    await executor(`
      ALTER TABLE ai_mcp_server
      DROP COLUMN IF EXISTS connector_binding_id,
      DROP COLUMN IF EXISTS origin
    `);
  },
};
