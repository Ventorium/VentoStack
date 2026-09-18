import type { Database } from '@ventostack/database';
import type { OAuthClientRow } from './protocol-contracts';
import { sha256 } from './protocol-utils';
import type { OAuthTokenSigner } from './token-signer';

export function createOAuthTokenLifecycleService(deps: {
  db: Database;
  signer: OAuthTokenSigner;
  issuer: string;
  audience: string;
  authenticate: (clientId: string, secret: string) => Promise<OAuthClientRow>;
  isBackendSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}) {
  return {
    async revoke(input: { clientId: string; secret: string; token: string }): Promise<void> {
      const client = await deps.authenticate(input.clientId, input.secret);
      const refreshRows = (await deps.db.raw(
        `SELECT family_id,session_id FROM oauth_refresh_token
         WHERE token_hash=$1 AND application_id=$2 LIMIT 1`,
        [await sha256(input.token), client.id],
      )) as Array<{ family_id: string; session_id: string }>;
      if (refreshRows[0]) {
        await deps.db.transaction(async (tx) => {
          await tx.raw('UPDATE oauth_refresh_token SET revoked_at=NOW() WHERE family_id=$1', [
            refreshRows[0]!.family_id,
          ]);
          await tx.raw(
            'UPDATE oauth_access_token SET revoked_at=NOW() WHERE client_session_id=$1',
            [refreshRows[0]!.session_id],
          );
        });
        return;
      }
      try {
        const claims = await deps.signer.verify(input.token, {
          issuer: deps.issuer.replace(/\/$/, ''),
          audience: deps.audience,
          typ: 'at+jwt',
        });
        if (claims.client_id === client.client_id && typeof claims.jti === 'string')
          await deps.db.raw(
            'UPDATE oauth_access_token SET revoked_at=NOW() WHERE jti=$1 AND application_id=$2',
            [claims.jti, client.id],
          );
      } catch {
        // RFC 7009 intentionally hides unknown, expired and foreign token state.
      }
    },

    async introspect(input: { clientId: string; secret: string; token: string }): Promise<
      Record<string, unknown>
    > {
      const client = await deps.authenticate(input.clientId, input.secret);
      try {
        const claims = await deps.signer.verify(input.token, {
          issuer: deps.issuer.replace(/\/$/, ''),
          audience: deps.audience,
          typ: 'at+jwt',
        });
        if (claims.client_id !== client.client_id || typeof claims.jti !== 'string')
          return { active: false };
        const rows = (await deps.db.raw(
          `SELECT ss.backend_session_id,t.user_id FROM oauth_access_token t
           JOIN oauth_client_session cs ON cs.id=t.client_session_id AND cs.revoked_at IS NULL
           JOIN oauth_sso_session ss ON ss.id=cs.sso_session_id AND ss.revoked_at IS NULL AND ss.absolute_expires_at>NOW()
           JOIN oauth_application a ON a.id=t.application_id AND a.enabled=TRUE AND a.status='ACTIVE'
           JOIN sys_user u ON u.tenant_id=t.tenant_id AND u.id=t.user_id AND u.status=1 AND u.blacklisted=FALSE AND u.deleted_at IS NULL
           WHERE t.jti=$1 AND t.application_id=$2 AND t.revoked_at IS NULL AND t.expires_at>NOW()
             AND (u.password_changed_at IS NULL OR ss.auth_time>=u.password_changed_at) LIMIT 1`,
          [claims.jti, client.id],
        )) as Array<{ backend_session_id: string; user_id: string }>;
        if (
          !rows[0] ||
          !(await deps.isBackendSessionActive(rows[0].backend_session_id, rows[0].user_id))
        )
          return { active: false };
        return {
          active: true,
          scope: claims.scope,
          client_id: claims.client_id,
          sub: claims.sub,
          aud: claims.aud,
          iss: claims.iss,
          exp: claims.exp,
          iat: claims.iat,
          jti: claims.jti,
          token_type: 'Bearer',
        };
      } catch {
        return { active: false };
      }
    },
  };
}

export type OAuthTokenLifecycleService = ReturnType<typeof createOAuthTokenLifecycleService>;
