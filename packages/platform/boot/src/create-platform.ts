/**
 * @ventostack/boot - 平台聚合器
 *
 * 一键创建完整的 VentoStack 平台，聚合所有业务模块。
 */

import {
  type AuthSessionManager,
  type JWTManager,
  type MultiDeviceManager,
  type PasswordHasher,
  type RBAC,
  type SessionManager,
  type TOTPManager,
  type TokenRefreshManager,
  createAuthMiddleware,
  createPermMiddleware,
} from '@ventostack/auth';
import type { Cache } from '@ventostack/cache';
import type { Router } from '@ventostack/core';
import { createConfigEncryptor, createRouter, createTagLogger } from '@ventostack/core';
import type { Database, SqlExecutor, TableSchemaInfo } from '@ventostack/database';
import { createDatabase } from '@ventostack/database';
import type { EventBus } from '@ventostack/events';
import type { AuditStore, HealthCheck } from '@ventostack/observability';

import type { Scheduler } from '@ventostack/events';
import { createGenModule } from '@ventostack/gen';
import type { GenModule } from '@ventostack/gen';
import { createI18nModule } from '@ventostack/i18n';
import type { I18nModule } from '@ventostack/i18n';
import { createMonitorModule } from '@ventostack/monitor';
import type { MonitorModule } from '@ventostack/monitor';
import { createNotificationModule } from '@ventostack/notification';
import type { NotificationModule, NotifyChannel } from '@ventostack/notification';
import { createOAuthModule } from '@ventostack/oauth';
import type { OAuthModule } from '@ventostack/oauth';
import { createOSSModule } from '@ventostack/oss';
import type { OSSModule, StorageAdapter } from '@ventostack/oss';
import { createSchedulerModule } from '@ventostack/scheduler';
import type { JobHandlerMap, SchedulerModule } from '@ventostack/scheduler';
import { createSystemModule } from '@ventostack/system';
import type { SystemModule } from '@ventostack/system';
import { createWorkflowModule, workflowInstanceCompleted } from '@ventostack/workflow';
import type { WorkflowModule } from '@ventostack/workflow';

// ---- AI 可选模块类型 ----
//
// @ventostack/ai 与 @ventostack/ai-trace 是 optionalDependencies：
// 未启用 AI 的应用（如纯管理后台）不需要安装这两个包。
// 因此 boot 不在顶层 import 它们，仅在 modules.ai === true 时动态加载，
// 并以下列最小结构化类型描述其模块形状（结构兼容即可，无运行时依赖）。

/** LLM Provider 配置（与 @ventostack/ai 的 LLMProviderConfig 结构兼容） */
export interface LLMProviderConfig {
  /** Provider 名称 */
  name: string;
  /** 线协议；Provider 名称与协议解耦，兼容聚合网关及私有 Provider。 */
  apiFormat?: 'openai_chat' | 'openai_response' | 'anthropic' | 'google' | (string & {});
  /** API Key */
  apiKey: string;
  /** 自定义 Base URL */
  baseUrl?: string;
  /** Provider 专用请求头。 */
  headers?: Record<string, string>;
}

/** AI 模块最小结构（createAIModule 返回值，结构兼容即可） */
export interface AIModule {
  services: {
    /** 事件发射器，供 ai-trace 订阅 */
    eventEmitter: unknown;
  };
  router: Router;
  init(): Promise<void>;
}

/** AI 链路追踪模块最小结构（createAiTraceModule 返回值，结构兼容即可） */
export interface AiTraceModule {
  router: Router;
  init(): Promise<void>;
}

/** 平台配置 */
export interface PlatformConfig {
  /** 数据库 executor */
  executor: SqlExecutor;
  /** 数据库实例（可选，若未提供则自动从 executor 创建） */
  db?: Database;
  /** 数据库表结构读取 */
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  /** 数据库表列表 */
  listTables: (executor: SqlExecutor) => Promise<string[]>;
  /** 缓存 */
  cache: Cache;
  /** JWT 管理 */
  jwt: JWTManager;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 密码哈希 */
  passwordHasher: PasswordHasher;
  /** TOTP 管理器 */
  totpManager: TOTPManager;
  /** RBAC 权限 */
  rbac: RBAC;
  /** 会话管理 */
  authSessionManager: AuthSessionManager;
  /** Token 刷新 */
  tokenRefreshManager: TokenRefreshManager;
  /** Session 管理 */
  sessionManager: SessionManager;
  /** 多设备管理 */
  multiDeviceManager: MultiDeviceManager;
  /** 审计存储 */
  auditStore: AuditStore;
  /** 事件总线 */
  eventBus: EventBus;
  /** 健康检查 */
  healthCheck: HealthCheck;
  /** 调度器 */
  scheduler: Scheduler;

  /** 模块开关 */
  modules?: {
    system?: boolean;
    monitor?: boolean;
    notification?: boolean;
    i18n?: boolean;
    workflow?: boolean;
    oss?: boolean;
    scheduler?: boolean;
    gen?: boolean;
    ai?: boolean;
    /** AI 链路追踪（依赖 ai 模块，缺省跟随 ai 开关） */
    aiTrace?: boolean;
    /** OAuth 2.0 / OpenID Connect 认证中心 */
    oauth?: boolean;
  };

  /** OSS 存储适配器 */
  storageAdapter?: StorageAdapter;
  /** 通知通道 */
  notifyChannels?: Map<string, NotifyChannel>;
  /** 定时任务处理器 */
  jobHandlers?: JobHandlerMap;
  /** WebAuthn RP ID */
  rpID?: string;
  /** WebAuthn RP 名称 */
  rpName?: string;
  /** WebAuthn 允许来源 */
  rpOrigins?: string[];
  /** 可信代理 IP/CIDR 列表，用于安全提取客户端真实 IP */
  trustedProxies?: string[];
  /** AI 模块配置 */
  aiConfig?: {
    llmProviders: LLMProviderConfig[];
    defaultModel: string;
    storagePath?: string;
    /** 恰好 32 字节的 Provider 凭据加密密钥 */
    credentialEncryptionKey: string;
    agentRuntime?: { baseUrl: string; token: string; timeoutMs: number };
  };

  /** 当前部署的可信租户标识；所有 Admin 资源必须绑定该值 */
  tenantId: string;
  /** @deprecated 保留兼容配置；Admin 中租户隔离始终启用 */
  tenantEnabled?: boolean;
  /** 认证 Cookie 是否附加 Secure 属性（生产环境应设为 true，防止令牌 Cookie 明文传输） */
  secureCookies?: boolean;
  /** OAuth 客户端 Secret 摘要 pepper，至少 32 字节。 */
  oauthSecretPepper?: string;
  /** 仅本地开发时允许 loopback HTTP 客户端 URL。 */
  oauthAllowLoopbackHttp?: boolean;
  oauthIssuer?: string;
  oauthLoginPath?: string;
  oauthSigningKey?: {
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
    verificationJwks?: JsonWebKey[];
  };
}

/** 平台实例 */
export interface Platform {
  /** 系统模块 */
  system?: SystemModule;
  /** 监控模块 */
  monitor?: MonitorModule;
  /** 通知模块 */
  notification?: NotificationModule;
  /** 国际化模块 */
  i18n?: I18nModule;
  /** 工作流模块 */
  workflow?: WorkflowModule;
  /** 文件存储模块 */
  oss?: OSSModule;
  /** 定时任务模块 */
  scheduler?: SchedulerModule;
  /** 代码生成模块 */
  gen?: GenModule;
  ai?: AIModule;
  /** AI 链路追踪模块 */
  aiTrace?: AiTraceModule;
  /** OAuth 2.0 / OpenID Connect 模块 */
  oauth?: OAuthModule;
  /** 所有路由的聚合 */
  router: Router;
  /** 初始化所有模块 */
  init(): Promise<void>;
}

const bootLog = createTagLogger('boot');

/** 动态加载可选 AI 模块（@ventostack/ai 未安装时给出明确指引） */
async function loadAIModule(params: {
  db: Database;
  cache: Cache;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  permMiddleware: ReturnType<typeof createPermMiddleware>;
  eventBus: EventBus;
  credentialEncryptionKey: string;
  llmProviders: LLMProviderConfig[];
  defaultModel: string;
  storagePath: string;
  agentRuntime?: { baseUrl: string; token: string; timeoutMs: number };
}): Promise<AIModule> {
  let factory: (deps: unknown) => AIModule;
  try {
    factory = (
      (await import('@ventostack/ai')) as {
        createAIModule: (deps: unknown) => AIModule;
      }
    ).createAIModule;
  } catch (error) {
    throw new Error(
      `modules.ai 已启用但未安装 @ventostack/ai（可选依赖）。请安装该包，或将 modules.ai 设为 false。原始错误：${String(error)}`,
    );
  }
  return factory({
    ...params,
    // framework/ai 不依赖 platform/auth：认证与权限中间件由平台组装层注入
    credentialEncryptor: createConfigEncryptor({ key: params.credentialEncryptionKey }),
  });
}

/** 动态加载可选 AI 链路追踪模块（@ventostack/ai-trace 未安装时给出明确指引） */
async function loadAiTraceModule(params: {
  db: Database;
  emitter: unknown;
  configProvider: unknown;
  jwt: JWTManager;
  jwtSecret: string;
  rbac: RBAC;
  tenantId: string;
}): Promise<AiTraceModule> {
  let factory: (deps: unknown) => AiTraceModule;
  try {
    factory = (
      (await import('@ventostack/ai-trace')) as {
        createAiTraceModule: (deps: unknown) => AiTraceModule;
      }
    ).createAiTraceModule;
  } catch (error) {
    throw new Error(
      `modules.aiTrace 已启用但未安装 @ventostack/ai-trace（可选依赖）。请安装该包，或将 modules.aiTrace 设为 false。原始错误：${String(error)}`,
    );
  }
  return factory(params);
}

/**
 * 创建完整的 VentoStack 平台
 */
export async function createPlatform(config: PlatformConfig): Promise<Platform> {
  const {
    executor,
    readTableSchema,
    cache,
    db: providedDb,
    jwt,
    jwtSecret,
    passwordHasher,
    totpManager,
    rbac,
    authSessionManager,
    tokenRefreshManager,
    sessionManager,
    multiDeviceManager,
    auditStore,
    eventBus,
    healthCheck,
    scheduler,
    modules: moduleFlags,
    storageAdapter,
    notifyChannels,
    jobHandlers,
    rpID,
    rpName,
    rpOrigins,
    trustedProxies,
    tenantEnabled,
    tenantId,
    secureCookies,
  } = config;

  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId || normalizedTenantId.length > 36) {
    throw new Error('tenantId must contain 1 to 36 characters');
  }

  const db = providedDb ?? createDatabase({ executor });

  if (moduleFlags?.ai === true && !config.aiConfig) {
    throw new Error('aiConfig is required when the AI module is enabled');
  }

  const enabled = {
    system: moduleFlags?.system !== false,
    monitor: moduleFlags?.monitor !== false,
    notification: moduleFlags?.notification !== false,
    i18n: moduleFlags?.i18n !== false,
    workflow: moduleFlags?.workflow !== false,
    oss: moduleFlags?.oss !== false,
    scheduler: moduleFlags?.scheduler !== false,
    gen: moduleFlags?.gen !== false,
    ai: moduleFlags?.ai === true,
    // 链路追踪依赖 ai 模块：ai 关闭时强制禁用
    aiTrace: moduleFlags?.aiTrace !== false && moduleFlags?.ai === true,
    oauth: moduleFlags?.oauth === true,
  };

  // Create modules
  const systemDeps = {
    db,
    cache,
    jwt,
    jwtSecret,
    passwordHasher,
    totp: totpManager,
    rbac,
    authSessionManager,
    tokenRefresh: tokenRefreshManager,
    sessionManager,
    deviceManager: multiDeviceManager,
    auditLog: auditStore,
    eventBus,
    ...(rpID !== undefined ? { rpID } : {}),
    ...(rpName !== undefined ? { rpName } : {}),
    ...(rpOrigins !== undefined ? { rpOrigins } : {}),
    ...(trustedProxies !== undefined ? { trustedProxies } : {}),
    ...(tenantEnabled !== undefined ? { tenantEnabled } : {}),
    tenantId: normalizedTenantId,
    ...(secureCookies !== undefined ? { secureCookies } : {}),
  };
  const system = enabled.system ? createSystemModule(systemDeps) : undefined;

  if (enabled.oauth && !system) {
    throw new Error('OAuth module requires the system module');
  }
  if (
    enabled.oauth &&
    (!config.oauthSecretPepper || !config.oauthIssuer || !config.oauthSigningKey)
  ) {
    throw new Error(
      'OAuth pepper, issuer and RS256 signing key are required when OAuth is enabled',
    );
  }
  if (enabled.oauth && !storageAdapter) throw new Error('OAuth module requires a storage adapter');
  const oauthMod =
    enabled.oauth && system
      ? createOAuthModule({
          db,
          rbac,
          authMiddleware: system.liveAuthMiddleware,
          sessionManager,
          storage: storageAdapter!,
          platformAdminMiddleware: system.services.governance.adminOnlyMiddleware,
          secretPepper: config.oauthSecretPepper!,
          tenantId: normalizedTenantId,
          issuer: config.oauthIssuer!,
          loginPath: config.oauthLoginPath ?? '/auth/login',
          secureCookies: secureCookies ?? false,
          signingKey: config.oauthSigningKey!,
          ...(config.oauthAllowLoopbackHttp !== undefined
            ? { allowLoopbackHttp: config.oauthAllowLoopbackHttp }
            : {}),
        })
      : undefined;

  const monitor = enabled.monitor
    ? createMonitorModule({
        healthCheck,
        jwt,
        jwtSecret,
        rbac,
        db,
        authSessionManager,
        sessionManager,
        multiDeviceManager,
        tenantId: normalizedTenantId,
      })
    : undefined;

  const notification =
    enabled.notification && notifyChannels
      ? createNotificationModule({
          db,
          jwt,
          jwtSecret,
          rbac,
          tenantId: normalizedTenantId,
          channels: notifyChannels,
        })
      : undefined;

  const i18n = enabled.i18n
    ? createI18nModule({
        db,
        jwt,
        jwtSecret,
        rbac,
        tenantId: normalizedTenantId,
      })
    : undefined;

  const workflow = enabled.workflow
    ? createWorkflowModule({
        db,
        jwt,
        jwtSecret,
        rbac,
        eventBus,
        tenantId: normalizedTenantId,
      })
    : undefined;

  if (system && workflow) {
    eventBus.on(workflowInstanceCompleted, async (payload) => {
      if (payload.businessType !== 'notice' || !payload.businessId) return;
      if (payload.tenantId !== normalizedTenantId) return;
      try {
        await system.services.notice.publishApproved(payload.businessId, payload.completedBy);
      } catch (error) {
        // 事件在审批事务内同步派发：发布失败不得回滚审批完结（例如审批期间公告被删除）。
        // publishApproved 幂等，重放安全；失败仅记录日志供人工跟进。
        bootLog.error(
          `notice approval publish failed (businessId=${payload.businessId}): ${String(error)}`,
        );
      }
    });
  }

  const oss =
    enabled.oss && storageAdapter
      ? createOSSModule({
          db,
          storage: storageAdapter,
          jwt,
          jwtSecret,
          rbac,
          tenantId: normalizedTenantId,
        })
      : undefined;

  const schedulerMod = enabled.scheduler
    ? createSchedulerModule({
        db,
        scheduler,
        jwt,
        jwtSecret,
        rbac,
        handlers: jobHandlers ?? {},
        tenantId: normalizedTenantId,
      })
    : undefined;

  const genMod = enabled.gen
    ? createGenModule({
        db,
        executor,
        readTableSchema,
        jwt,
        jwtSecret,
        rbac,
        tenantId: normalizedTenantId,
      })
    : undefined;

  // AI 模块：仅在实际启用时动态加载 @ventostack/ai / @ventostack/ai-trace。
  // 这两个包是 optionalDependencies，未启用 AI 的应用不必安装；
  // 动态 import 使未安装时不影响包解析与构建（bun build --packages=external 保留 import 语句，仅运行时触发）。
  const aiMod = enabled.ai
    ? await loadAIModule({
        db,
        cache,
        // framework/ai 不依赖 platform/auth：认证与权限中间件由平台组装层注入
        authMiddleware: createAuthMiddleware(jwt, jwtSecret, normalizedTenantId),
        permMiddleware: createPermMiddleware(rbac),
        eventBus,
        credentialEncryptionKey: config.aiConfig!.credentialEncryptionKey,
        llmProviders: config.aiConfig?.llmProviders ?? [],
        defaultModel: config.aiConfig?.defaultModel ?? 'gpt-4o-mini',
        storagePath: config.aiConfig?.storagePath ?? './data/knowledge-bases',
        ...(config.aiConfig?.agentRuntime ? { agentRuntime: config.aiConfig.agentRuntime } : {}),
      })
    : undefined;

  // AI 链路追踪：订阅 ai 模块事件流（system 须先创建以提供配置读取）
  const aiTraceMod =
    enabled.aiTrace && aiMod && system
      ? await loadAiTraceModule({
          db,
          emitter: aiMod.services.eventEmitter,
          configProvider: system.services.config,
          jwt,
          jwtSecret,
          rbac,
          tenantId: normalizedTenantId,
        })
      : undefined;

  // Aggregate routers
  const router = createRouter();

  // system 提供统一操作审计；挂在聚合路由后覆盖所有已启用平台模块。
  // system 内部已有的局部挂载由中间件自身去重，避免重复日志。
  if (system) router.use(system.operationLogMiddleware);

  // Mount module routers
  if (system) router.merge(system.router);
  if (oauthMod) router.merge(oauthMod.router);
  if (monitor) router.merge(monitor.router);
  if (notification) router.merge(notification.router);
  if (i18n) router.merge(i18n.router);
  if (workflow) router.merge(workflow.router);
  if (oss) router.merge(oss.router);
  if (schedulerMod) router.merge(schedulerMod.router);
  if (genMod) router.merge(genMod.router);
  if (aiMod) router.merge(aiMod.router);
  if (aiTraceMod) router.merge(aiTraceMod.router);

  return {
    ...(system !== undefined ? { system } : {}),
    ...(monitor !== undefined ? { monitor } : {}),
    ...(notification !== undefined ? { notification } : {}),
    ...(i18n !== undefined ? { i18n } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(oss !== undefined ? { oss } : {}),
    ...(schedulerMod !== undefined ? { scheduler: schedulerMod } : {}),
    ...(genMod !== undefined ? { gen: genMod } : {}),
    router,
    ...(aiMod !== undefined ? { ai: aiMod } : {}),
    ...(aiTraceMod !== undefined ? { aiTrace: aiTraceMod } : {}),
    ...(oauthMod !== undefined ? { oauth: oauthMod } : {}),
    async init() {
      if (system) await system.init();
      if (monitor) await monitor.init();
      if (notification) await notification.init();
      if (i18n) await i18n.init();
      if (workflow) await workflow.init();
      if (oss) await oss.init();
      if (schedulerMod) await schedulerMod.init();
      if (genMod) await genMod.init();
      if (aiMod) await aiMod.init();
      if (aiTraceMod) await aiTraceMod.init();
      if (oauthMod) await oauthMod.init();
    },
  };
}
