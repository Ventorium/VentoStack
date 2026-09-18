import type { Database } from '@ventostack/database';
import { OAuthProtocolError } from './authorization';
import { appendOAuthParams, randomToken, sha256 } from './protocol-utils';
import type { OAuthTokenSigner } from './token-signer';

export function createOAuthLogoutService(deps: {
  db: Database;
  tenantId: string;
  issuer: string;
  signer: OAuthTokenSigner;
}) {
  const issuer = deps.issuer.replace(/\/$/, '');
  return {
    async prepare(input: {
      ssoToken?: string;
      idTokenHint?: string;
      clientId?: string;
      postLogoutRedirectUri?: string;
      state?: string;
    }): Promise<string> {
      if (!input.ssoToken && !input.idTokenHint)
        throw new OAuthProtocolError('invalid_request', '缺少 SSO Session 或 id_token_hint');
      let hintedClientId: string | undefined;
      let hintedSid: string | undefined;
      if (input.idTokenHint) {
        const parts = input.idTokenHint.split('.');
        if (parts.length !== 3)
          throw new OAuthProtocolError('invalid_request', 'id_token_hint 无效');
        let untrusted: Record<string, unknown>;
        try {
          untrusted = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<
            string,
            unknown
          >;
        } catch {
          throw new OAuthProtocolError('invalid_request', 'id_token_hint 无效');
        }
        if (typeof untrusted.aud !== 'string')
          throw new OAuthProtocolError('invalid_request', 'id_token_hint aud 无效');
        const claims = await deps.signer.verify(input.idTokenHint, {
          issuer,
          audience: untrusted.aud,
          typ: 'JWT',
          maxExpiredSeconds: 86_400,
        });
        if (typeof claims.sid !== 'string')
          throw new OAuthProtocolError('invalid_request', 'id_token_hint sid 缺失');
        hintedClientId = untrusted.aud;
        hintedSid = claims.sid;
      }
      if (input.clientId && hintedClientId && input.clientId !== hintedClientId)
        throw new OAuthProtocolError('invalid_request', 'client_id 与 id_token_hint 不匹配');
      const sessions = input.ssoToken
        ? ((await deps.db.raw(
            `SELECT id FROM oauth_sso_session WHERE session_hash=$1 AND tenant_id=$2
             AND revoked_at IS NULL AND absolute_expires_at>NOW() LIMIT 1`,
            [await sha256(input.ssoToken), deps.tenantId],
          )) as Array<{ id: string }>)
        : ((await deps.db.raw(
            `SELECT ss.id FROM oauth_client_session cs
             JOIN oauth_sso_session ss ON ss.id=cs.sso_session_id
             JOIN oauth_application a ON a.id=cs.application_id
             WHERE cs.sid=$1 AND a.client_id=$2 AND ss.tenant_id=$3
               AND cs.revoked_at IS NULL AND ss.revoked_at IS NULL
               AND ss.absolute_expires_at>NOW() LIMIT 1`,
            [hintedSid, hintedClientId, deps.tenantId],
          )) as Array<{ id: string }>);
      const session = sessions[0];
      if (!session) throw new OAuthProtocolError('invalid_request', 'SSO Session 无效', 401);
      if (hintedSid) {
        const binding = (await deps.db.raw(
          `SELECT 1 FROM oauth_client_session WHERE sso_session_id=$1 AND sid=$2
           AND revoked_at IS NULL LIMIT 1`,
          [session.id, hintedSid],
        )) as unknown[];
        if (!binding.length)
          throw new OAuthProtocolError('invalid_request', 'id_token_hint 与当前 Session 不匹配');
      }
      let applicationId: string | null = null;
      if (input.postLogoutRedirectUri) {
        const clientId = input.clientId ?? hintedClientId;
        if (!clientId) throw new OAuthProtocolError('invalid_request', '回跳需要客户端标识');
        const apps = (await deps.db.raw(
          `SELECT id FROM oauth_application WHERE client_id=$1 AND post_logout_redirect_uri=$2
           AND status!='DELETED' LIMIT 1`,
          [clientId, input.postLogoutRedirectUri],
        )) as Array<{ id: string }>;
        if (!apps[0]) throw new OAuthProtocolError('invalid_request', '退出回调地址无效');
        applicationId = apps[0].id;
      }
      const token = randomToken();
      await deps.db.raw(
        `INSERT INTO oauth_logout_transaction
         (id,token_hash,sso_session_id,application_id,post_logout_redirect_uri,state_value,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          crypto.randomUUID(),
          await sha256(token),
          session.id,
          applicationId,
          input.postLogoutRedirectUri ?? null,
          input.state ?? null,
          new Date(Date.now() + 5 * 60_000),
        ],
      );
      return token;
    },
    async execute(token: string): Promise<string | null> {
      return deps.db.transaction(async (tx) => {
        const rows = (await tx.raw(
          `UPDATE oauth_logout_transaction SET consumed_at=NOW()
           WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW()
           RETURNING sso_session_id,post_logout_redirect_uri,state_value`,
          [await sha256(token)],
        )) as Array<{
          sso_session_id: string;
          post_logout_redirect_uri: string | null;
          state_value: string | null;
        }>;
        const transaction = rows[0];
        if (!transaction) throw new OAuthProtocolError('invalid_request', '退出事务无效或已过期');
        const clients = (await tx.raw(
          `SELECT cs.sid,a.id application_id,a.client_id,a.backchannel_logout_uri
           FROM oauth_client_session cs
           JOIN oauth_application a ON a.id=cs.application_id
           WHERE cs.sso_session_id=$1 AND cs.revoked_at IS NULL
             AND a.backchannel_logout_uri IS NOT NULL AND a.status!='DELETED'`,
          [transaction.sso_session_id],
        )) as Array<{
          sid: string;
          application_id: string;
          client_id: string;
          backchannel_logout_uri: string;
        }>;
        const now = Math.floor(Date.now() / 1000);
        for (const client of clients) {
          const logoutToken = await deps.signer.sign(
            {
              iss: issuer,
              aud: client.client_id,
              iat: now,
              exp: now + 900,
              jti: crypto.randomUUID(),
              sid: client.sid,
              events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
            },
            { typ: 'logout+jwt' },
          );
          await tx.raw(
            `INSERT INTO oauth_logout_outbox
             (id,tenant_id,application_id,session_id,endpoint,payload)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              crypto.randomUUID(),
              deps.tenantId,
              client.application_id,
              client.sid,
              client.backchannel_logout_uri,
              logoutToken,
            ],
          );
        }
        await tx.raw('UPDATE oauth_sso_session SET revoked_at=NOW() WHERE id=$1', [
          transaction.sso_session_id,
        ]);
        await tx.raw('UPDATE oauth_client_session SET revoked_at=NOW() WHERE sso_session_id=$1', [
          transaction.sso_session_id,
        ]);
        await tx.raw(
          `UPDATE oauth_refresh_token SET revoked_at=NOW() WHERE session_id IN
           (SELECT id FROM oauth_client_session WHERE sso_session_id=$1)`,
          [transaction.sso_session_id],
        );
        await tx.raw(
          `UPDATE oauth_access_token SET revoked_at=NOW() WHERE client_session_id IN
           (SELECT id FROM oauth_client_session WHERE sso_session_id=$1)`,
          [transaction.sso_session_id],
        );
        return transaction.post_logout_redirect_uri
          ? appendOAuthParams(transaction.post_logout_redirect_uri, {
              state: transaction.state_value ?? undefined,
            })
          : null;
      });
    },
  };
}

export type OAuthLogoutService = ReturnType<typeof createOAuthLogoutService>;
