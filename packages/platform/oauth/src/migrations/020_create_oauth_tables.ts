import type { Migration } from '@ventostack/database';

export const createOAuthTables: Migration = {
  name: '020_create_oauth_tables',
  up: async (executor) => {
    await executor('ALTER TABLE sys_menu ADD COLUMN IF NOT EXISTS application_id VARCHAR(36)');
    await executor(
      'CREATE INDEX IF NOT EXISTS idx_sys_menu_application ON sys_menu(tenant_id, application_id)',
    );
    await executor(`CREATE TABLE IF NOT EXISTS oauth_application (
      id VARCHAR(36) PRIMARY KEY,
      identifier VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description VARCHAR(512), icon_url VARCHAR(2048), icon_storage_path VARCHAR(2048),
      icon_mime_type VARCHAR(64),
      homepage_url VARCHAR(2048) NOT NULL, redirect_uri VARCHAR(2048) NOT NULL,
      post_logout_redirect_uri VARCHAR(2048), backchannel_logout_uri VARCHAR(2048),
      backchannel_logout_session_required BOOLEAN NOT NULL DEFAULT TRUE,
      client_id VARCHAR(64) NOT NULL UNIQUE,
      client_secret_digest VARCHAR(128) NOT NULL,
      client_secret_version INT NOT NULL DEFAULT 1,
      allowed_scopes TEXT NOT NULL,
      offline_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort INT NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 9999),
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','DELETING','DELETED')),
      deleted_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await executor(
      'CREATE INDEX IF NOT EXISTS idx_oauth_application_portal ON oauth_application(enabled, status, sort)',
    );
    await executor(`DO $$ BEGIN
      ALTER TABLE sys_menu ADD CONSTRAINT fk_sys_menu_oauth_application
        FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await executor(`CREATE TABLE IF NOT EXISTS oauth_application_role_grant (
      tenant_id VARCHAR(36) NOT NULL, application_id VARCHAR(36) NOT NULL, role_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (tenant_id, application_id, role_id),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id, role_id) REFERENCES sys_role(tenant_id, id) ON DELETE CASCADE
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_application_user_grant (
      tenant_id VARCHAR(36) NOT NULL, application_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (tenant_id, application_id, user_id),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id, user_id) REFERENCES sys_user(tenant_id, id) ON DELETE CASCADE
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_application_dept_grant (
      tenant_id VARCHAR(36) NOT NULL, application_id VARCHAR(36) NOT NULL, dept_id VARCHAR(36) NOT NULL,
      scope VARCHAR(32) NOT NULL CHECK (scope IN ('SELF','SELF_AND_DESCENDANTS')),
      PRIMARY KEY (tenant_id, application_id, dept_id),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id, dept_id) REFERENCES sys_dept(tenant_id, id) ON DELETE CASCADE
    )`);

    await executor(`CREATE TABLE IF NOT EXISTS oauth_authorization_request (
      id VARCHAR(36) PRIMARY KEY, request_hash VARCHAR(64) NOT NULL UNIQUE,
      tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36), application_id VARCHAR(36) NOT NULL,
      redirect_uri VARCHAR(2048) NOT NULL, scope TEXT NOT NULL, state_hash VARCHAR(64) NOT NULL,
      state_value VARCHAR(512) NOT NULL, nonce VARCHAR(255), code_challenge VARCHAR(128) NOT NULL, session_id VARCHAR(128),
      expires_at TIMESTAMP NOT NULL, consumed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_authorization_code (
      id VARCHAR(36) PRIMARY KEY, code_hash VARCHAR(64) NOT NULL UNIQUE,
      tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, application_id VARCHAR(36) NOT NULL,
      redirect_uri VARCHAR(2048) NOT NULL, scope TEXT NOT NULL, nonce VARCHAR(255),
      code_challenge VARCHAR(128) NOT NULL, session_id VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL, consumed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_refresh_token (
      id VARCHAR(36) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL UNIQUE, family_id VARCHAR(36) NOT NULL,
      parent_id VARCHAR(36), tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      application_id VARCHAR(36) NOT NULL, session_id VARCHAR(128) NOT NULL, scope TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL, consumed_at TIMESTAMP, replaced_by VARCHAR(36), revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
    await executor(
      'CREATE INDEX IF NOT EXISTS idx_oauth_refresh_family ON oauth_refresh_token(family_id)',
    );
    await executor(`CREATE TABLE IF NOT EXISTS oauth_sso_session (
      id VARCHAR(36) PRIMARY KEY, session_hash VARCHAR(64) NOT NULL UNIQUE,
      tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      backend_session_id VARCHAR(128) NOT NULL, auth_time TIMESTAMP NOT NULL,
      last_seen_at TIMESTAMP NOT NULL, expires_at TIMESTAMP NOT NULL,
      absolute_expires_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_client_session (
      id VARCHAR(36) PRIMARY KEY, sso_session_id VARCHAR(36) NOT NULL,
      tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      application_id VARCHAR(36) NOT NULL, sid VARCHAR(128) NOT NULL UNIQUE,
      revoked_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (sso_session_id) REFERENCES oauth_sso_session(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_access_token (
      jti VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
      application_id VARCHAR(36) NOT NULL, client_session_id VARCHAR(36) NOT NULL,
      scope TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT,
      FOREIGN KEY (client_session_id) REFERENCES oauth_client_session(id) ON DELETE CASCADE
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_auth_log (
      id VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36), user_id VARCHAR(36), application_id VARCHAR(36),
      client_id_snapshot VARCHAR(64), application_name_snapshot VARCHAR(128), identifier_snapshot VARCHAR(64),
      event_type VARCHAR(64) NOT NULL, success BOOLEAN NOT NULL, failure_code VARCHAR(64),
      ip VARCHAR(64), user_agent VARCHAR(512), metadata JSON, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await executor(
      'CREATE INDEX IF NOT EXISTS idx_oauth_auth_log_tenant_time ON oauth_auth_log(tenant_id, created_at)',
    );
    await executor(`CREATE TABLE IF NOT EXISTS oauth_logout_outbox (
      id VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36) NOT NULL, application_id VARCHAR(36) NOT NULL,
      session_id VARCHAR(128), endpoint VARCHAR(2048) NOT NULL, payload TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(), delivered_at TIMESTAMP, last_error VARCHAR(512),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      ,FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
    await executor(`CREATE TABLE IF NOT EXISTS oauth_logout_transaction (
      id VARCHAR(36) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL UNIQUE,
      sso_session_id VARCHAR(36) NOT NULL, application_id VARCHAR(36),
      post_logout_redirect_uri VARCHAR(2048), state_value VARCHAR(512),
      expires_at TIMESTAMP NOT NULL, consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      FOREIGN KEY (sso_session_id) REFERENCES oauth_sso_session(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES oauth_application(id) ON DELETE RESTRICT
    )`);
  },
  down: async (executor) => {
    await executor('DROP TABLE IF EXISTS oauth_logout_outbox');
    await executor('DROP TABLE IF EXISTS oauth_logout_transaction');
    await executor('DROP TABLE IF EXISTS oauth_auth_log');
    await executor('DROP TABLE IF EXISTS oauth_access_token');
    await executor('DROP TABLE IF EXISTS oauth_client_session');
    await executor('DROP TABLE IF EXISTS oauth_sso_session');
    await executor('DROP TABLE IF EXISTS oauth_refresh_token');
    await executor('DROP TABLE IF EXISTS oauth_authorization_code');
    await executor('DROP TABLE IF EXISTS oauth_authorization_request');
    await executor('DROP TABLE IF EXISTS oauth_application_dept_grant');
    await executor('DROP TABLE IF EXISTS oauth_application_user_grant');
    await executor('DROP TABLE IF EXISTS oauth_application_role_grant');
    await executor('ALTER TABLE sys_menu DROP CONSTRAINT IF EXISTS fk_sys_menu_oauth_application');
    await executor('DROP TABLE IF EXISTS oauth_application');
    await executor('DROP INDEX IF EXISTS idx_sys_menu_application');
    await executor('ALTER TABLE sys_menu DROP COLUMN IF EXISTS application_id');
  },
};
