import type { Database } from '@ventostack/database';
import { assertSafeUpload } from '@ventostack/oss';
import type { StorageAdapter } from '@ventostack/oss';
import { OAuthApplicationModel } from '../models';
import type { ApplicationRow } from './application-contracts';
import { OAuthApplicationError } from './application-contracts';

export function createOAuthApplicationIconService(deps: {
  db: Database;
  storage: StorageAdapter;
  issuer: string;
}) {
  async function remove(path: string): Promise<void> {
    try {
      await deps.storage.delete(path);
    } catch {
      // Database state is authoritative; stale object cleanup can be retried operationally.
    }
  }
  async function row(id: string): Promise<ApplicationRow | null> {
    return deps.db
      .query(OAuthApplicationModel)
      .where('id', '=', id)
      .where('status', '!=', 'DELETED')
      .get() as unknown as Promise<ApplicationRow | null>;
  }
  return {
    async upload(id: string, filename: string, data: Buffer): Promise<{ iconUrl: string }> {
      const current = await row(id);
      if (!current)
        throw new OAuthApplicationError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
      const mimeType = assertSafeUpload(filename, data);
      if (!mimeType.startsWith('image/')) throw new OAuthApplicationError('Icon 必须是图片');
      const extension = filename.includes('.')
        ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
        : '';
      const storagePath = `oauth-icons/${id}/${crypto.randomUUID()}${extension}`;
      await deps.storage.write(storagePath, data, mimeType);
      const iconUrl = `${deps.issuer.replace(/\/$/, '')}/applications/${id}/icon`;
      await deps.db.query(OAuthApplicationModel).where('id', '=', id).update({
        icon_url: iconUrl,
        icon_storage_path: storagePath,
        icon_mime_type: mimeType,
        updated_at: new Date(),
      });
      if (current.icon_storage_path) await remove(current.icon_storage_path);
      return { iconUrl };
    },
    async read(id: string): Promise<{ stream: ReadableStream; mimeType: string } | null> {
      const current = await row(id);
      if (!current?.icon_storage_path || !current.icon_mime_type) return null;
      const stream = await deps.storage.read(current.icon_storage_path);
      return stream ? { stream, mimeType: current.icon_mime_type } : null;
    },
    remove,
  };
}
