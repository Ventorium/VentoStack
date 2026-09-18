import type { AuthUser } from '@ventostack/auth';
import type { Database } from '@ventostack/database';
import type { OAuthGrantService } from './grants';
import type {
  AuthorizationInput,
  AuthorizationResult,
  OAuthClientRow,
  SsoSessionRow,
} from './protocol-contracts';
import { appendOAuthParams, randomToken, sha256 } from './protocol-utils';

export class OAuthProtocolError extends Error {
  readonly error: string;
  readonly description: string;
  readonly status: number;

  constructor(error: string, description: string, status = 400) {
    super(description);
    this.error = error;
    this.description = description;
    this.status = status;
    this.name = 'OAuthProtocolError';
  }
}

function scopes(value: string): string[] {
  return [...new Set(value.split(' ').filter(Boolean))];
}

export function createOAuthAuthorizationService(deps: {
  db: Database;
  grants: OAuthGrantService;
  tenantId: string;
  issuer: string;
  loginPath: string;
  secureCookies: boolean;
  authorizationCodeTtlSeconds: number;
  ssoIdleTtlSeconds: number;
  ssoAbsoluteTtlSeconds: number;
  isBackendSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}) {
  const issuer = deps.issuer.replace(/\/$/, '');

  async function findClient(clientId: string): Promise<OAuthClientRow | null> {
    const rows = (await deps.db.raw(
      `SELECT id,client_id,client_secret_digest,name,identifier,redirect_uri,allowed_scopes,
              offline_access_enabled,enabled,status
       FROM oauth_application WHERE client_id=$1 AND enabled=TRUE AND status='ACTIVE' LIMIT 1`,
      [clientId],
    )) as OAuthClientRow[];
    return rows[0] ?? null;
  }

  async function validate(input: AuthorizationInput): Promise<OAuthClientRow> {
    const client = await findClient(input.clientId);
    if (!client) throw new OAuthProtocolError('invalid_request', '无效客户端');
    if (input.redirectUri !== client.redirect_uri)
      throw new OAuthProtocolError('invalid_request', 'redirect_uri 不匹配');
    if (input.responseType !== 'code')
      throw new OAuthProtocolError('unsupported_response_type', '仅支持 code');
    if (!input.state || input.state.length < 22 || input.state.length > 512)
      throw new OAuthProtocolError('invalid_request', 'state 长度无效');
    if (!input.nonce || input.nonce.length > 255)
      throw new OAuthProtocolError('invalid_request', 'nonce 缺失或过长');
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge) || input.codeChallengeMethod !== 'S256')
      throw new OAuthProtocolError('invalid_request', '必须使用 PKCE S256');
    const requested = scopes(input.scope);
    const allowed = new Set(scopes(client.allowed_scopes));
    if (!requested.includes('openid') || requested.some((scope) => !allowed.has(scope)))
      throw new OAuthProtocolError('invalid_scope', '请求包含未授权 Scope');
    return client;
  }

  async function issueCode(
    client: OAuthClientRow,
    input: AuthorizationInput,
    session: SsoSessionRow,
  ): Promise<string> {
    const user: AuthUser = {
      id: session.user_id,
      username: '',
      roles: [],
      tenantId: session.tenant_id,
    };
    if (!(await deps.grants.canAccess(client.id, user)))
      throw new OAuthProtocolError('access_denied', '当前用户无权访问该应用', 403);
    const code = randomToken();
    const now = Date.now();
    await deps.db.raw(
      `INSERT INTO oauth_authorization_code
       (id,code_hash,tenant_id,user_id,application_id,redirect_uri,scope,nonce,code_challenge,session_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        crypto.randomUUID(),
        await sha256(code),
        deps.tenantId,
        session.user_id,
        client.id,
        input.redirectUri,
        scopes(input.scope).join(' '),
        input.nonce,
        input.codeChallenge,
        session.id,
        new Date(now + deps.authorizationCodeTtlSeconds * 1000),
      ],
    );
    return code;
  }

  async function resolveSession(token: string | undefined): Promise<SsoSessionRow | null> {
    if (!token) return null;
    const rows = (await deps.db.raw(
      `SELECT s.* FROM oauth_sso_session s
       JOIN sys_user u ON u.tenant_id=s.tenant_id AND u.id=s.user_id
       WHERE s.session_hash=$1 AND s.tenant_id=$2 AND s.revoked_at IS NULL
         AND s.expires_at>NOW() AND s.absolute_expires_at>NOW()
         AND u.status=1 AND u.blacklisted=FALSE AND u.deleted_at IS NULL
         AND (u.password_changed_at IS NULL OR s.auth_time>=u.password_changed_at) LIMIT 1`,
      [await sha256(token), deps.tenantId],
    )) as SsoSessionRow[];
    if (!rows[0]) return null;
    if (!(await deps.isBackendSessionActive(rows[0].backend_session_id, rows[0].user_id))) {
      await deps.db.raw('UPDATE oauth_sso_session SET revoked_at=NOW() WHERE id=$1', [rows[0].id]);
      return null;
    }
    await deps.db.raw('UPDATE oauth_sso_session SET last_seen_at=NOW(),expires_at=$2 WHERE id=$1', [
      rows[0].id,
      new Date(
        Math.min(Date.now() + deps.ssoIdleTtlSeconds * 1000, rows[0].absolute_expires_at.getTime()),
      ),
    ]);
    return rows[0];
  }

  return {
    async errorRedirect(
      input: Pick<AuthorizationInput, 'clientId' | 'redirectUri' | 'state'>,
      error: unknown,
    ): Promise<string | null> {
      const client = await findClient(input.clientId);
      if (!client || input.redirectUri !== client.redirect_uri) return null;
      const known = error as Partial<OAuthProtocolError>;
      return appendOAuthParams(input.redirectUri, {
        error: typeof known.error === 'string' ? known.error : 'server_error',
        error_description:
          typeof known.description === 'string' ? known.description : '请求处理失败',
        state: input.state || undefined,
        iss: issuer,
      });
    },
    async authorize(input: AuthorizationInput, ssoToken?: string): Promise<AuthorizationResult> {
      const client = await validate(input);
      const session = await resolveSession(ssoToken);
      if (session) {
        const code = await issueCode(client, input, session);
        return {
          kind: 'redirect',
          location: appendOAuthParams(input.redirectUri, { code, state: input.state, iss: issuer }),
          applicationId: client.id,
        };
      }
      const requestToken = randomToken();
      await deps.db.raw(
        `INSERT INTO oauth_authorization_request
         (id,request_hash,tenant_id,application_id,redirect_uri,scope,state_hash,state_value,nonce,code_challenge,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          crypto.randomUUID(),
          await sha256(requestToken),
          deps.tenantId,
          client.id,
          input.redirectUri,
          scopes(input.scope).join(' '),
          await sha256(input.state),
          input.state,
          input.nonce,
          input.codeChallenge,
          new Date(Date.now() + 10 * 60_000),
        ],
      );
      const login = new URL(deps.loginPath, issuer);
      login.searchParams.set('oauth_request', requestToken);
      return { kind: 'login', location: login.toString(), applicationId: client.id };
    },

    async bootstrap(user: AuthUser, requestToken: string): Promise<AuthorizationResult> {
      if (!user.sessionId || user.tenantId !== deps.tenantId)
        throw new OAuthProtocolError('access_denied', '后台认证会话无效', 401);
      const requestRows = (await deps.db.raw(
        `UPDATE oauth_authorization_request SET consumed_at=NOW(),user_id=$2
         WHERE request_hash=$1 AND tenant_id=$3 AND consumed_at IS NULL AND expires_at>NOW()
         RETURNING application_id,redirect_uri,scope,state_value,nonce,code_challenge`,
        [await sha256(requestToken), user.id, deps.tenantId],
      )) as Array<{
        application_id: string;
        redirect_uri: string;
        scope: string;
        state_value: string;
        nonce: string;
        code_challenge: string;
      }>;
      const request = requestRows[0];
      if (!request) throw new OAuthProtocolError('invalid_request', '授权事务无效或已过期');
      const clientRows = (await deps.db.raw(
        `SELECT id,client_id,client_secret_digest,name,identifier,redirect_uri,allowed_scopes,
          offline_access_enabled,enabled,status FROM oauth_application WHERE id=$1 AND enabled=TRUE AND status='ACTIVE'`,
        [request.application_id],
      )) as OAuthClientRow[];
      const client = clientRows[0];
      if (!client) throw new OAuthProtocolError('access_denied', 'Application 已不可用', 403);
      const rawSession = randomToken();
      const session: SsoSessionRow = {
        id: crypto.randomUUID(),
        tenant_id: deps.tenantId,
        user_id: user.id,
        backend_session_id: user.sessionId,
        auth_time: new Date(),
        expires_at: new Date(Date.now() + deps.ssoIdleTtlSeconds * 1000),
        absolute_expires_at: new Date(Date.now() + deps.ssoAbsoluteTtlSeconds * 1000),
        revoked_at: null,
      };
      await deps.db.raw(
        `INSERT INTO oauth_sso_session
         (id,session_hash,tenant_id,user_id,backend_session_id,auth_time,last_seen_at,expires_at,absolute_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)`,
        [
          session.id,
          await sha256(rawSession),
          session.tenant_id,
          session.user_id,
          session.backend_session_id,
          session.auth_time,
          session.expires_at,
          session.absolute_expires_at,
        ],
      );
      const input: AuthorizationInput = {
        responseType: 'code',
        clientId: client.client_id,
        redirectUri: request.redirect_uri,
        scope: request.scope,
        state: request.state_value,
        nonce: request.nonce,
        codeChallenge: request.code_challenge,
        codeChallengeMethod: 'S256',
      };
      const code = await issueCode(client, input, session);
      return {
        kind: 'redirect',
        location: appendOAuthParams(input.redirectUri, { code, state: input.state, iss: issuer }),
        applicationId: client.id,
        setCookie: `${deps.secureCookies ? '__Host-vs_sso' : 'vs_sso'}=${encodeURIComponent(rawSession)}; Path=/; Max-Age=${deps.ssoAbsoluteTtlSeconds}; HttpOnly; SameSite=Lax${deps.secureCookies ? '; Secure' : ''}`,
      };
    },
  };
}

export type OAuthAuthorizationService = ReturnType<typeof createOAuthAuthorizationService>;
