import type { Database } from '@ventostack/database';
import { verifyClientSecret } from './application-security';
import { OAuthProtocolError } from './authorization';
import type {
  AuthorizationCodeRow,
  OAuthClientRow,
  RefreshTokenRow,
  TokenResult,
} from './protocol-contracts';
import { randomToken, sha256, validatePkceVerifier } from './protocol-utils';
import type { OAuthTokenSigner } from './token-signer';

export function createOAuthTokenService(deps: {
  db: Database;
  signer: OAuthTokenSigner;
  secretPepper: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  isBackendSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}) {
  const issuer = deps.issuer.replace(/\/$/, '');

  async function authenticate(clientId: string, secret: string): Promise<OAuthClientRow> {
    const rows = (await deps.db.raw(
      `SELECT id,client_id,client_secret_digest,name,identifier,redirect_uri,allowed_scopes,
              offline_access_enabled,enabled,status
       FROM oauth_application WHERE client_id=$1 AND enabled=TRUE AND status='ACTIVE' LIMIT 1`,
      [clientId],
    )) as OAuthClientRow[];
    const client = rows[0];
    const digest = client?.client_secret_digest ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const valid = await verifyClientSecret(secret, digest, deps.secretPepper);
    if (!client || !valid) throw new OAuthProtocolError('invalid_client', '客户端认证失败', 401);
    return client;
  }

  async function issueTokens(
    database: Database,
    client: OAuthClientRow,
    code: AuthorizationCodeRow,
  ): Promise<TokenResult> {
    const now = Math.floor(Date.now() / 1000);
    const sid = randomToken(24);
    const clientSessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const scope = code.scope.split(' ').filter(Boolean);
    await database.raw(
      `INSERT INTO oauth_client_session
       (id,sso_session_id,tenant_id,user_id,application_id,sid)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clientSessionId, code.session_id, code.tenant_id, code.user_id, client.id, sid],
    );
    await database.raw(
      `INSERT INTO oauth_access_token
       (jti,tenant_id,user_id,application_id,client_session_id,scope,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        jti,
        code.tenant_id,
        code.user_id,
        client.id,
        clientSessionId,
        code.scope,
        new Date((now + deps.accessTokenTtlSeconds) * 1000),
      ],
    );
    const accessToken = await deps.signer.sign(
      {
        iss: issuer,
        sub: code.user_id,
        aud: deps.audience,
        client_id: client.client_id,
        sid,
        tenant_id: code.tenant_id,
        scope: code.scope,
        iat: now,
        exp: now + deps.accessTokenTtlSeconds,
        jti,
      },
      { typ: 'at+jwt' },
    );
    const idToken = await deps.signer.sign({
      iss: issuer,
      sub: code.user_id,
      aud: client.client_id,
      sid,
      nonce: code.nonce,
      auth_time: Math.floor(code.auth_time.getTime() / 1000),
      amr: ['pwd'],
      iat: now,
      exp: now + deps.accessTokenTtlSeconds,
    });
    const result: TokenResult = {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: deps.accessTokenTtlSeconds,
      scope: code.scope,
      id_token: idToken,
    };
    if (scope.includes('offline_access') && client.offline_access_enabled) {
      const refreshToken = randomToken();
      const refreshId = crypto.randomUUID();
      await database.raw(
        `INSERT INTO oauth_refresh_token
         (id,token_hash,family_id,tenant_id,user_id,application_id,session_id,scope,expires_at)
         VALUES ($1,$2,$1,$3,$4,$5,$6,$7,$8)`,
        [
          refreshId,
          await sha256(refreshToken),
          code.tenant_id,
          code.user_id,
          client.id,
          clientSessionId,
          code.scope,
          new Date(Date.now() + deps.refreshTokenTtlSeconds * 1000),
        ],
      );
      result.refresh_token = refreshToken;
    }
    return result;
  }

  /**
   * 撤销整个 Refresh Token Family 及其客户端 Session 与派生 Access Token。
   * 必须在失败事务之外独立提交：重放检测需要留下不可回滚的撤销证据。
   */
  async function revokeFamily(familyId: string, sessionId: string): Promise<void> {
    await deps.db.transaction(async (tx) => {
      await tx.raw('UPDATE oauth_refresh_token SET revoked_at=NOW() WHERE family_id=$1', [familyId]);
      await tx.raw('UPDATE oauth_client_session SET revoked_at=NOW() WHERE id=$1', [sessionId]);
      await tx.raw('UPDATE oauth_access_token SET revoked_at=NOW() WHERE client_session_id=$1', [
        sessionId,
      ]);
    });
  }

  return {
    authenticate,
    async exchangeCode(input: {
      clientId: string;
      secret: string;
      code: string;
      redirectUri: string;
      codeVerifier: string;
    }): Promise<TokenResult> {
      const client = await authenticate(input.clientId, input.secret);
      if (!validatePkceVerifier(input.codeVerifier))
        throw new OAuthProtocolError('invalid_grant', '授权码或 PKCE 校验失败');
      const challenge = await sha256(input.codeVerifier);
      return deps.db.transaction(async (tx) => {
        const rows = await tx.raw(
          `UPDATE oauth_authorization_code c SET consumed_at=NOW()
           FROM oauth_sso_session s,sys_user u
           WHERE c.session_id=s.id AND c.code_hash=$1 AND c.application_id=$2
             AND c.redirect_uri=$3 AND c.code_challenge=$4 AND c.consumed_at IS NULL
             AND c.expires_at>NOW() AND s.revoked_at IS NULL AND s.expires_at>NOW()
             AND u.tenant_id=c.tenant_id AND u.id=c.user_id AND u.status=1
             AND u.blacklisted=FALSE AND u.deleted_at IS NULL
             AND (u.password_changed_at IS NULL OR s.auth_time>=u.password_changed_at)
           RETURNING c.*,s.auth_time,s.backend_session_id`,
          [await sha256(input.code), client.id, input.redirectUri, challenge],
        );
        const code = (rows as AuthorizationCodeRow[])[0];
        if (!code) throw new OAuthProtocolError('invalid_grant', '授权码或 PKCE 校验失败');
        if (!(await deps.isBackendSessionActive(code.backend_session_id, code.user_id)))
          throw new OAuthProtocolError('invalid_grant', '中心 Session 已失效');
        return issueTokens(tx, client, code);
      });
    },

    async refresh(input: {
      clientId: string;
      secret: string;
      refreshToken: string;
      scope?: string;
    }): Promise<TokenResult> {
      const client = await authenticate(input.clientId, input.secret);
      const outcome = await deps.db.transaction(async (tx) => {
        const rows = (await tx.raw(
          `UPDATE oauth_refresh_token r SET consumed_at=NOW()
           FROM oauth_client_session cs,oauth_sso_session ss,sys_user u
           WHERE r.session_id=cs.id AND cs.sso_session_id=ss.id AND r.token_hash=$1
             AND r.application_id=$2 AND r.consumed_at IS NULL AND r.revoked_at IS NULL
             AND r.expires_at>NOW() AND cs.revoked_at IS NULL AND ss.revoked_at IS NULL
             AND ss.absolute_expires_at>NOW() AND u.tenant_id=r.tenant_id AND u.id=r.user_id
             AND u.status=1 AND u.blacklisted=FALSE AND u.deleted_at IS NULL
             AND (u.password_changed_at IS NULL OR ss.auth_time>=u.password_changed_at)
           RETURNING r.*,cs.sid,ss.auth_time,ss.backend_session_id`,
          [await sha256(input.refreshToken), client.id],
        )) as RefreshTokenRow[];
        const current = rows[0];
        if (!current) {
          const replay = (await tx.raw(
            'SELECT family_id,session_id FROM oauth_refresh_token WHERE token_hash=$1 AND application_id=$2 AND consumed_at IS NOT NULL LIMIT 1',
            [await sha256(input.refreshToken), client.id],
          )) as Array<{ family_id: string; session_id: string }>;
          // 撤销写入不能随本次失败事务回滚，交由事务提交后独立执行
          return replay[0]
            ? {
                kind: 'replay' as const,
                familyId: replay[0].family_id,
                sessionId: replay[0].session_id,
              }
            : { kind: 'invalid' as const };
        }
        if (!(await deps.isBackendSessionActive(current.backend_session_id, current.user_id)))
          return { kind: 'session_invalid' as const, sessionId: current.session_id };
        const originalScopes = current.scope.split(' ').filter(Boolean);
        const requestedScopes = input.scope
          ? [...new Set(input.scope.split(' ').filter(Boolean))]
          : originalScopes;
        if (requestedScopes.some((scope) => !originalScopes.includes(scope)))
          throw new OAuthProtocolError('invalid_scope', '刷新时只能缩小 Scope');
        const scope = requestedScopes.join(' ');
        const replacement = randomToken();
        const replacementId = crypto.randomUUID();
        await tx.raw(
          `INSERT INTO oauth_refresh_token
           (id,token_hash,family_id,parent_id,tenant_id,user_id,application_id,session_id,scope,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            replacementId,
            await sha256(replacement),
            current.family_id,
            current.id,
            current.tenant_id,
            current.user_id,
            current.application_id,
            current.session_id,
            scope,
            new Date(Date.now() + deps.refreshTokenTtlSeconds * 1000),
          ],
        );
        await tx.raw('UPDATE oauth_refresh_token SET replaced_by=$2 WHERE id=$1', [
          current.id,
          replacementId,
        ]);
        const now = Math.floor(Date.now() / 1000);
        const jti = crypto.randomUUID();
        await tx.raw(
          `INSERT INTO oauth_access_token
           (jti,tenant_id,user_id,application_id,client_session_id,scope,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            jti,
            current.tenant_id,
            current.user_id,
            current.application_id,
            current.session_id,
            scope,
            new Date((now + deps.accessTokenTtlSeconds) * 1000),
          ],
        );
        const accessToken = await deps.signer.sign(
          {
            iss: issuer,
            sub: current.user_id,
            aud: deps.audience,
            client_id: client.client_id,
            sid: current.sid,
            tenant_id: current.tenant_id,
            scope,
            iat: now,
            exp: now + deps.accessTokenTtlSeconds,
            jti,
          },
          { typ: 'at+jwt' },
        );
        const idToken = await deps.signer.sign({
          iss: issuer,
          sub: current.user_id,
          aud: client.client_id,
          sid: current.sid,
          auth_time: Math.floor(current.auth_time.getTime() / 1000),
          iat: now,
          exp: now + deps.accessTokenTtlSeconds,
        });
        return {
          kind: 'ok' as const,
          result: {
            token_type: 'Bearer',
            access_token: accessToken,
            expires_in: deps.accessTokenTtlSeconds,
            scope,
            id_token: idToken,
            refresh_token: replacement,
          },
        };
      });
      if (outcome.kind === 'replay') {
        await revokeFamily(outcome.familyId, outcome.sessionId);
        throw new OAuthProtocolError('invalid_grant', 'Refresh Token 无效或已被使用');
      }
      if (outcome.kind === 'session_invalid') {
        await deps.db.raw('UPDATE oauth_client_session SET revoked_at=NOW() WHERE id=$1', [
          outcome.sessionId,
        ]);
        throw new OAuthProtocolError('invalid_grant', '中心 Session 已失效');
      }
      if (outcome.kind === 'invalid')
        throw new OAuthProtocolError('invalid_grant', 'Refresh Token 无效或已被使用');
      return outcome.result;
    },
  };
}

export type OAuthTokenService = ReturnType<typeof createOAuthTokenService>;
