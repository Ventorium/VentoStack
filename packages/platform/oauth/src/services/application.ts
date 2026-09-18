import type { Database } from '@ventostack/database';
import type { StorageAdapter } from '@ventostack/oss';
import {
  OAuthApplicationDeptGrantModel,
  OAuthApplicationModel,
  OAuthApplicationRoleGrantModel,
  OAuthApplicationUserGrantModel,
} from '../models';
import {
  type ApplicationRow,
  type CreateApplicationParams,
  type OAuthApplication,
  OAuthApplicationError,
  type UpdateApplicationParams,
} from './application-contracts';
import { createOAuthApplicationIconService } from './application-icon';
import {
  digestClientSecret,
  randomOAuthValue,
  validateApplicationScopes,
  validateApplicationUrl,
} from './application-security';

export {
  OAuthApplicationError,
  type CreateApplicationParams,
  type OAuthApplication,
  type UpdateApplicationParams,
} from './application-contracts';

function toApplication(row: ApplicationRow): OAuthApplication {
  return {
    id: row.id,
    identifier: row.identifier,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    homepageUrl: row.homepage_url,
    redirectUri: row.redirect_uri,
    postLogoutRedirectUri: row.post_logout_redirect_uri,
    backchannelLogoutUri: row.backchannel_logout_uri,
    backchannelLogoutSessionRequired: row.backchannel_logout_session_required,
    clientId: row.client_id,
    allowedScopes: row.allowed_scopes.split(' ').filter(Boolean),
    offlineAccessEnabled: row.offline_access_enabled,
    enabled: row.enabled,
    sort: row.sort,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface OAuthApplicationService {
  list(params: { page: number; pageSize: number; name?: string; status?: string }): Promise<{
    items: OAuthApplication[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  getById(id: string): Promise<OAuthApplication | null>;
  create(
    params: CreateApplicationParams,
  ): Promise<{ id: string; clientId: string; clientSecret: string }>;
  update(id: string, params: UpdateApplicationParams): Promise<void>;
  regenerateSecret(id: string): Promise<{ clientSecret: string }>;
  delete(id: string): Promise<void>;
  uploadIcon(id: string, filename: string, data: Buffer): Promise<{ iconUrl: string }>;
  readIcon(id: string): Promise<{ stream: ReadableStream; mimeType: string } | null>;
}

export function createOAuthApplicationService(deps: {
  db: Database;
  secretPepper: string;
  allowLoopbackHttp?: boolean;
  storage: StorageAdapter;
  issuer: string;
}): OAuthApplicationService {
  if (new TextEncoder().encode(deps.secretPepper).length < 32) {
    throw new Error('OAuth secret pepper must be at least 32 bytes');
  }
  const { db } = deps;
  const icons = createOAuthApplicationIconService(deps);

  async function findRow(id: string): Promise<ApplicationRow | null> {
    return db
      .query(OAuthApplicationModel)
      .where('id', '=', id)
      .where('status', '!=', 'DELETED')
      .get() as unknown as Promise<ApplicationRow | null>;
  }

  function normalizeInput(
    params: CreateApplicationParams | UpdateApplicationParams,
    current?: OAuthApplication,
  ): Record<string, unknown> {
    const offline = params.offlineAccessEnabled ?? current?.offlineAccessEnabled ?? false;
    const result: Record<string, unknown> = {};
    if ('name' in params && params.name !== undefined) result.name = params.name.trim();
    if ('description' in params && params.description !== undefined)
      result.description = params.description?.trim() || null;
    if ('iconUrl' in params && params.iconUrl !== undefined)
      result.icon_url = params.iconUrl
        ? validateApplicationUrl(params.iconUrl, 'iconUrl', deps.allowLoopbackHttp ?? false)
        : null;
    if ('homepageUrl' in params && params.homepageUrl !== undefined)
      result.homepage_url = validateApplicationUrl(
        params.homepageUrl,
        'homepageUrl',
        deps.allowLoopbackHttp ?? false,
      );
    if ('redirectUri' in params && params.redirectUri !== undefined)
      result.redirect_uri = validateApplicationUrl(
        params.redirectUri,
        'redirectUri',
        deps.allowLoopbackHttp ?? false,
      );
    if ('postLogoutRedirectUri' in params && params.postLogoutRedirectUri !== undefined)
      result.post_logout_redirect_uri = params.postLogoutRedirectUri
        ? validateApplicationUrl(
            params.postLogoutRedirectUri,
            'postLogoutRedirectUri',
            deps.allowLoopbackHttp ?? false,
          )
        : null;
    if ('backchannelLogoutUri' in params && params.backchannelLogoutUri !== undefined)
      result.backchannel_logout_uri = params.backchannelLogoutUri
        ? validateApplicationUrl(
            params.backchannelLogoutUri,
            'backchannelLogoutUri',
            deps.allowLoopbackHttp ?? false,
          )
        : null;
    if (params.allowedScopes !== undefined || params.offlineAccessEnabled !== undefined) {
      const scopes = params.allowedScopes ?? current?.allowedScopes;
      if (!scopes) throw new OAuthApplicationError('allowedScopes 不能为空');
      result.allowed_scopes = validateApplicationScopes(scopes, offline).join(' ');
    }
    if (params.offlineAccessEnabled !== undefined) result.offline_access_enabled = offline;
    if (params.backchannelLogoutSessionRequired !== undefined)
      result.backchannel_logout_session_required = params.backchannelLogoutSessionRequired;
    if (params.enabled !== undefined) {
      result.enabled = params.enabled;
      result.status = params.enabled ? 'ACTIVE' : 'DISABLED';
    }
    if (params.sort !== undefined) result.sort = params.sort;
    result.updated_at = new Date();
    return result;
  }

  return {
    async list(params) {
      let query = db.query(OAuthApplicationModel).where('status', '!=', 'DELETED');
      if (params.name) query = query.where('name', 'LIKE', `%${params.name}%`);
      if (params.status) query = query.where('status', '=', params.status);
      const total = await query.count();
      const rows = (await query
        .orderBy('sort', 'asc')
        .orderBy('created_at', 'desc')
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize)
        .list()) as unknown as ApplicationRow[];
      return {
        items: rows.map(toApplication),
        total,
        page: params.page,
        pageSize: params.pageSize,
      };
    },
    async getById(id) {
      const row = await findRow(id);
      return row ? toApplication(row) : null;
    },
    async create(params) {
      if (!/^[a-z][a-z0-9_-]{1,63}$/.test(params.identifier)) {
        throw new OAuthApplicationError('identifier 格式无效');
      }
      if (!params.name.trim()) throw new OAuthApplicationError('name 不能为空');
      const id = crypto.randomUUID();
      const clientId = `vs_${randomOAuthValue(24)}`;
      const clientSecret = randomOAuthValue(32);
      const digest = await digestClientSecret(clientSecret, deps.secretPepper);
      const offline = params.offlineAccessEnabled ?? false;
      await db.query(OAuthApplicationModel).insert({
        id,
        identifier: params.identifier.trim(),
        client_id: clientId,
        client_secret_digest: digest,
        client_secret_version: 1,
        allowed_scopes: validateApplicationScopes(params.allowedScopes, offline).join(' '),
        offline_access_enabled: offline,
        enabled: params.enabled ?? true,
        status: params.enabled === false ? 'DISABLED' : 'ACTIVE',
        sort: params.sort ?? 0,
        created_at: new Date(),
        ...normalizeInput(params),
      });
      return { id, clientId, clientSecret };
    },
    async update(id, params) {
      if (params.name !== undefined && !params.name.trim()) {
        throw new OAuthApplicationError('name 不能为空');
      }
      const currentRow = await findRow(id);
      if (!currentRow)
        throw new OAuthApplicationError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
      const current = toApplication(currentRow);
      const values = normalizeInput(params, current);
      await db
        .query(OAuthApplicationModel)
        .where('id', '=', id)
        .where('status', 'IN', ['ACTIVE', 'DISABLED'])
        .update(values);
    },
    async regenerateSecret(id) {
      const current = await findRow(id);
      if (!current)
        throw new OAuthApplicationError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
      const clientSecret = randomOAuthValue(32);
      await db
        .query(OAuthApplicationModel)
        .where('id', '=', id)
        .where('status', 'IN', ['ACTIVE', 'DISABLED'])
        .update({
          client_secret_digest: await digestClientSecret(clientSecret, deps.secretPepper),
          client_secret_version: current.client_secret_version + 1,
          updated_at: new Date(),
        });
      return { clientSecret };
    },
    uploadIcon: icons.upload,
    readIcon: icons.read,
    async delete(id) {
      const current = await findRow(id);
      if (!current)
        throw new OAuthApplicationError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
      await db.transaction(async (tx) => {
        await tx
          .query(OAuthApplicationModel)
          .where('id', '=', id)
          .where('status', 'IN', ['ACTIVE', 'DISABLED'])
          .update({ enabled: false, status: 'DELETING', updated_at: new Date() });
        await tx.raw(
          'UPDATE oauth_authorization_code SET consumed_at=NOW() WHERE application_id=$1 AND consumed_at IS NULL',
          [id],
        );
        await tx.raw(
          'UPDATE oauth_refresh_token SET revoked_at=NOW() WHERE application_id=$1 AND revoked_at IS NULL',
          [id],
        );
        await tx.raw(
          'UPDATE oauth_access_token SET revoked_at=NOW() WHERE application_id=$1 AND revoked_at IS NULL',
          [id],
        );
        await tx.raw(
          'UPDATE oauth_client_session SET revoked_at=NOW() WHERE application_id=$1 AND revoked_at IS NULL',
          [id],
        );
        await tx.query(OAuthApplicationRoleGrantModel).where('application_id', '=', id).delete();
        await tx.query(OAuthApplicationUserGrantModel).where('application_id', '=', id).delete();
        await tx.query(OAuthApplicationDeptGrantModel).where('application_id', '=', id).delete();
        await tx
          .query(OAuthApplicationModel)
          .where('id', '=', id)
          .where('status', '=', 'DELETING')
          .update({
            name: '[deleted]',
            description: null,
            icon_url: null,
            icon_storage_path: null,
            icon_mime_type: null,
            homepage_url: 'https://deleted.invalid/',
            redirect_uri: 'https://deleted.invalid/callback',
            post_logout_redirect_uri: null,
            backchannel_logout_uri: null,
            client_secret_digest: '',
            allowed_scopes: '',
            status: 'DELETED',
            deleted_at: new Date(),
            updated_at: new Date(),
          });
      });
      if (current.icon_storage_path) await icons.remove(current.icon_storage_path);
    },
  };
}
