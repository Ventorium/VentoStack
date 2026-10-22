import type { Migration } from '@ventostack/database';

/**
 * Agent 虚拟机运行时表
 *
 * - ai_runtime_host：全局宿主池（平台管理员维护）
 * - ai_runtime_user_quota：用户资源上限（VM 数量默认不限制）
 * - ai_agent_runtime：按 (tenant_id, user_id, agent_id) 唯一的 VM 实例
 * - ai_session_runtime：会话 → 实例 / 本次注入知识库
 * - ai_runtime_session_kb_file：知识库精准同步 manifest
 * - ai_runtime_workspace_file：/workspace 重要文件备份 manifest
 */
export const createAiRuntimeTables: Migration = {
  name: '021_create_ai_runtime_tables',
  up: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_runtime_host (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        note VARCHAR(500),
        listen_address VARCHAR(255),
        base_url VARCHAR(512),
        token_cipher TEXT,
        source VARCHAR(16) NOT NULL DEFAULT 'manual',
        source_key VARCHAR(64),
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        version VARCHAR(64),
        protocol_version VARCHAR(64),
        cpu_total INT NOT NULL DEFAULT 0,
        memory_mb_total INT NOT NULL DEFAULT 0,
        disk_mb_total INT NOT NULL DEFAULT 0,
        max_sandboxes INT NOT NULL DEFAULT 20,
        reserved_cpu INT NOT NULL DEFAULT 0,
        reserved_memory_mb INT NOT NULL DEFAULT 0,
        reserved_disk_mb INT NOT NULL DEFAULT 0,
        reserved_inflight_cpu INT NOT NULL DEFAULT 0,
        reserved_inflight_memory_mb INT NOT NULL DEFAULT 0,
        reserved_inflight_disk_mb INT NOT NULL DEFAULT 0,
        usage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_checked_at TIMESTAMPTZ,
        last_online_at TIMESTAMPTZ,
        latency_ms INT,
        last_error TEXT,
        created_by VARCHAR(36),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_runtime_host_source_key
      ON ai_runtime_host(source_key) WHERE source_key IS NOT NULL
    `);
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_runtime_host_base_url
      ON ai_runtime_host(base_url) WHERE base_url IS NOT NULL
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_runtime_host_status
      ON ai_runtime_host(status, enabled)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_runtime_user_quota (
        tenant_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        max_instances INT NOT NULL DEFAULT 0,
        max_cpu INT NOT NULL DEFAULT 0,
        max_memory_mb INT NOT NULL DEFAULT 0,
        max_disk_mb INT NOT NULL DEFAULT 0,
        updated_by VARCHAR(36),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, user_id)
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_agent_runtime (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        agent_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        host_id VARCHAR(36) NOT NULL REFERENCES ai_runtime_host(id) ON DELETE RESTRICT,
        sandbox_id VARCHAR(128),
        state VARCHAR(16) NOT NULL DEFAULT 'provisioning',
        cpu_count INT NOT NULL DEFAULT 2,
        memory_mb INT NOT NULL DEFAULT 4096,
        disk_mb INT NOT NULL DEFAULT 8192,
        max_processes INT NOT NULL DEFAULT 512,
        last_active_at TIMESTAMPTZ,
        last_checked_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        last_global_memory_sync_at TIMESTAMPTZ,
        last_workspace_sync_at TIMESTAMPTZ,
        idle_notified_at TIMESTAMPTZ,
        stale_notified_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, user_id, agent_id)
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_runtime_sandbox
      ON ai_agent_runtime(sandbox_id) WHERE sandbox_id IS NOT NULL
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_agent_runtime_tenant_state
      ON ai_agent_runtime(tenant_id, state)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_agent_runtime_host_state
      ON ai_agent_runtime(host_id, state)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_agent_runtime_user
      ON ai_agent_runtime(tenant_id, user_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_session_runtime (
        session_id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        instance_id VARCHAR(36) NOT NULL REFERENCES ai_agent_runtime(id) ON DELETE CASCADE,
        bound_kb_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        kb_dirty BOOLEAN NOT NULL DEFAULT FALSE,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_runtime_instance
      ON ai_session_runtime(tenant_id, instance_id)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_runtime_kb
      ON ai_session_runtime USING GIN (bound_kb_ids)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_runtime_session_kb_file (
        tenant_id VARCHAR(36) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        kb_id VARCHAR(36) NOT NULL,
        path VARCHAR(1024) NOT NULL,
        size BIGINT NOT NULL DEFAULT 0,
        mtime_ms BIGINT NOT NULL DEFAULT 0,
        sha256 VARCHAR(64) NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, session_id, kb_id, path)
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_runtime_session_kb_file_kb
      ON ai_runtime_session_kb_file(tenant_id, kb_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_runtime_workspace_file (
        tenant_id VARCHAR(36) NOT NULL,
        instance_id VARCHAR(36) NOT NULL REFERENCES ai_agent_runtime(id) ON DELETE CASCADE,
        path VARCHAR(1024) NOT NULL,
        size BIGINT NOT NULL DEFAULT 0,
        sha256 VARCHAR(64) NOT NULL,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, instance_id, path)
      )
    `);
  },

  down: async (executor) => {
    await executor('DROP TABLE IF EXISTS ai_runtime_workspace_file CASCADE');
    await executor('DROP TABLE IF EXISTS ai_runtime_session_kb_file CASCADE');
    await executor('DROP TABLE IF EXISTS ai_session_runtime CASCADE');
    await executor('DROP TABLE IF EXISTS ai_agent_runtime CASCADE');
    await executor('DROP TABLE IF EXISTS ai_runtime_user_quota CASCADE');
    await executor('DROP TABLE IF EXISTS ai_runtime_host CASCADE');
  },
};
