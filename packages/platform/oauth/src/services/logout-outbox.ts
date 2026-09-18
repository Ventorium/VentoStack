import type { Database } from '@ventostack/database';
import { assertSafeBackchannelUrl } from './backchannel-security';

interface LogoutOutboxRow {
  id: string;
  endpoint: string;
  payload: string;
  attempts: number;
}

export function createOAuthLogoutOutboxService(deps: { db: Database; batchSize?: number }) {
  const batchSize = deps.batchSize ?? 20;
  return {
    async deliverPending(): Promise<number> {
      const rows = (await deps.db.raw(
        `WITH selected AS (
           SELECT id FROM oauth_logout_outbox
           WHERE (status IN ('PENDING','RETRY') AND next_attempt_at<=NOW())
              OR (status='DELIVERING' AND updated_at<NOW()-INTERVAL '1 minute')
           ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED
         )
         UPDATE oauth_logout_outbox o SET status='DELIVERING',updated_at=NOW()
         FROM selected WHERE o.id=selected.id
         RETURNING o.id,o.endpoint,o.payload,o.attempts`,
        [batchSize],
      )) as LogoutOutboxRow[];
      let delivered = 0;
      for (const row of rows) {
        try {
          await assertSafeBackchannelUrl(row.endpoint);
          const response = await fetch(row.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ logout_token: row.payload }),
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await deps.db.raw(
            `UPDATE oauth_logout_outbox SET status='DELIVERED',attempts=attempts+1,
             delivered_at=NOW(),updated_at=NOW(),last_error=NULL WHERE id=$1`,
            [row.id],
          );
          delivered += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          const status = attempts >= 8 ? 'FAILED' : 'RETRY';
          const delaySeconds = Math.min(300, 2 ** attempts);
          await deps.db.raw(
            `UPDATE oauth_logout_outbox SET status=$2,attempts=$3,
             next_attempt_at=NOW()+($4 * INTERVAL '1 second'),last_error=$5,updated_at=NOW()
             WHERE id=$1`,
            [
              row.id,
              status,
              attempts,
              delaySeconds,
              (error instanceof Error ? error.message : 'delivery failed').slice(0, 512),
            ],
          );
        }
      }
      return delivered;
    },
  };
}

export type OAuthLogoutOutboxService = ReturnType<typeof createOAuthLogoutOutboxService>;
