import { createPermMiddleware } from '@ventostack/auth';
import type { RBAC, SessionManager } from '@ventostack/auth';
import { createRouter } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import type { StorageAdapter } from '@ventostack/oss';
import { createOAuthAdminCsrfMiddleware } from './middlewares/admin-csrf';
import { createRecentAuthenticationMiddleware } from './middlewares/recent-auth';
import { createOAuthApplicationMenuRoutes } from './routes/application-menus';
import { createOAuthApplicationRoutes } from './routes/applications';
import { createOAuthContextRoutes } from './routes/context';
import { createOAuthGrantRoutes } from './routes/grants';
import { createOAuthIconRoutes } from './routes/icons';
import { createOAuthLogRoutes } from './routes/logs';
import { createOAuthMetadataRoutes } from './routes/metadata';
import { createOAuthProtocolRoutes } from './routes/protocol';
import { createOAuthApplicationService } from './services/application';
import type { OAuthApplicationService } from './services/application';
import { createOAuthApplicationMenuService } from './services/application-menu';
import { createOAuthAuthLogService } from './services/auth-log';
import { createOAuthAuthorizationService } from './services/authorization';
import { createOAuthContextService } from './services/context';
import { createOAuthGrantService } from './services/grants';
import { createOAuthLogoutService } from './services/logout';
import { createOAuthLogoutOutboxService } from './services/logout-outbox';
import { createOAuthTokenService } from './services/token';
import { createOAuthTokenLifecycleService } from './services/token-lifecycle';
import { createRS256TokenSigner } from './services/token-signer';

export interface OAuthModule {
  services: {
    application: OAuthApplicationService;
    grants: ReturnType<typeof createOAuthGrantService>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface OAuthModuleDeps {
  db: Database;
  rbac: RBAC;
  authMiddleware: Middleware;
  sessionManager: SessionManager;
  storage: StorageAdapter;
  platformAdminMiddleware: Middleware;
  secretPepper: string;
  tenantId: string;
  issuer: string;
  loginPath: string;
  secureCookies: boolean;
  signingKey: {
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
    verificationJwks?: JsonWebKey[];
  };
  allowLoopbackHttp?: boolean;
}

export function createOAuthModule(deps: OAuthModuleDeps): OAuthModule {
  const application = createOAuthApplicationService({
    db: deps.db,
    secretPepper: deps.secretPepper,
    storage: deps.storage,
    issuer: deps.issuer,
    ...(deps.allowLoopbackHttp !== undefined ? { allowLoopbackHttp: deps.allowLoopbackHttp } : {}),
  });
  const router = createRouter();
  const adminCsrf = createOAuthAdminCsrfMiddleware(deps.issuer);
  const recentAuth = createRecentAuthenticationMiddleware(deps.sessionManager);
  const grants = createOAuthGrantService({ db: deps.db, tenantId: deps.tenantId });
  const authLog = createOAuthAuthLogService({ db: deps.db, tenantId: deps.tenantId });
  const applicationMenus = createOAuthApplicationMenuService({
    db: deps.db,
    tenantId: deps.tenantId,
  });
  const signer = createRS256TokenSigner(deps.signingKey);
  const isBackendSessionActive = async (sessionId: string, userId: string): Promise<boolean> => {
    const session = await deps.sessionManager.get(sessionId);
    return session?.data.userId === userId;
  };
  const authorization = createOAuthAuthorizationService({
    db: deps.db,
    grants,
    tenantId: deps.tenantId,
    issuer: deps.issuer,
    loginPath: deps.loginPath,
    secureCookies: deps.secureCookies,
    authorizationCodeTtlSeconds: 60,
    ssoIdleTtlSeconds: 1800,
    ssoAbsoluteTtlSeconds: 28_800,
    isBackendSessionActive,
  });
  const token = createOAuthTokenService({
    db: deps.db,
    signer,
    secretPepper: deps.secretPepper,
    issuer: deps.issuer,
    audience: `${deps.issuer.replace(/\/$/, '')}/me/context`,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    isBackendSessionActive,
  });
  const context = createOAuthContextService({
    db: deps.db,
    signer,
    issuer: deps.issuer,
    audience: `${deps.issuer.replace(/\/$/, '')}/me/context`,
    isBackendSessionActive,
  });
  const tokenLifecycle = createOAuthTokenLifecycleService({
    db: deps.db,
    signer,
    issuer: deps.issuer,
    audience: `${deps.issuer.replace(/\/$/, '')}/me/context`,
    authenticate: token.authenticate,
    isBackendSessionActive,
  });
  const logout = createOAuthLogoutService({
    db: deps.db,
    tenantId: deps.tenantId,
    issuer: deps.issuer,
    signer,
  });
  const logoutOutbox = createOAuthLogoutOutboxService({ db: deps.db });
  router.merge(
    createOAuthApplicationRoutes({
      service: application,
      authMiddleware: deps.authMiddleware,
      platformAdminMiddleware: deps.platformAdminMiddleware,
      csrfMiddleware: adminCsrf,
      recentAuthMiddleware: recentAuth,
      perm: createPermMiddleware(deps.rbac),
    }),
  );
  router.merge(
    createOAuthIconRoutes({
      service: application,
      authMiddleware: deps.authMiddleware,
      platformAdminMiddleware: deps.platformAdminMiddleware,
      csrfMiddleware: adminCsrf,
      perm: createPermMiddleware(deps.rbac),
    }),
  );
  router.merge(
    createOAuthApplicationMenuRoutes({
      service: applicationMenus,
      authMiddleware: deps.authMiddleware,
      csrfMiddleware: adminCsrf,
      perm: createPermMiddleware(deps.rbac),
    }),
  );
  router.merge(
    createOAuthProtocolRoutes({
      authorization,
      token,
      tokenLifecycle,
      authMiddleware: deps.authMiddleware,
      authLog,
      logout,
    }),
  );
  router.merge(createOAuthMetadataRoutes({ signer, issuer: deps.issuer }));
  router.merge(
    createOAuthGrantRoutes({
      service: grants,
      authMiddleware: deps.authMiddleware,
      csrfMiddleware: adminCsrf,
      perm: createPermMiddleware(deps.rbac),
    }),
  );
  router.merge(createOAuthContextRoutes(context));
  router.merge(
    createOAuthLogRoutes({
      service: authLog,
      authMiddleware: deps.authMiddleware,
      perm: createPermMiddleware(deps.rbac),
    }),
  );
  return {
    services: { application, grants },
    router,
    async init() {
      await logoutOutbox.deliverPending();
      const timer = setInterval(() => {
        void logoutOutbox.deliverPending();
      }, 5000);
      timer.unref();
    },
  };
}
