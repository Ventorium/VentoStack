import { client } from '@/api';
import type {
  DeptItem,
  OAuthApplicationGrants,
  OAuthApplicationItem,
  OAuthApplicationMenu,
  OAuthApplicationSecret,
  OAuthPortalApplication,
  PaginatedData,
  RoleItem,
  UserItem,
} from '@/api/types';

type Result<T> = Promise<{ error?: unknown; data?: T }>;
type UntypedClient = {
  get(path: string, options?: Record<string, unknown>): Result<unknown>;
  post(path: string, options?: Record<string, unknown>): Result<unknown>;
  put(path: string, options?: Record<string, unknown>): Result<unknown>;
  delete(path: string, options?: Record<string, unknown>): Result<unknown>;
};
const api = client as unknown as UntypedClient;

export const oauthApi = {
  list(query: Record<string, unknown>): Result<PaginatedData<OAuthApplicationItem>> {
    return api.get('/api/oauth/admin/applications', { query }) as Result<
      PaginatedData<OAuthApplicationItem>
    >;
  },
  create(body: Record<string, unknown>): Result<OAuthApplicationSecret> {
    return api.post('/api/oauth/admin/applications', { body }) as Result<OAuthApplicationSecret>;
  },
  update(id: string, body: Record<string, unknown>): Result<null> {
    return api.put('/api/oauth/admin/applications/:id', { params: { id }, body }) as Result<null>;
  },
  remove(id: string): Result<null> {
    return api.delete('/api/oauth/admin/applications/:id', { params: { id } }) as Result<null>;
  },
  regenerateSecret(id: string): Result<OAuthApplicationSecret> {
    return api.post('/api/oauth/admin/applications/:id/secret', {
      params: { id },
    }) as Result<OAuthApplicationSecret>;
  },
  grants(id: string): Result<OAuthApplicationGrants> {
    return api.get('/api/oauth/admin/applications/:id/grants', {
      params: { id },
    }) as Result<OAuthApplicationGrants>;
  },
  updateGrants(id: string, body: OAuthApplicationGrants): Result<null> {
    return api.put('/api/oauth/admin/applications/:id/grants', {
      params: { id },
      body,
    }) as Result<null>;
  },
  roles(): Result<PaginatedData<RoleItem>> {
    return api.get('/api/system/roles', { query: { page: 1, pageSize: 100, status: 1 } }) as Result<
      PaginatedData<RoleItem>
    >;
  },
  users(): Result<PaginatedData<UserItem>> {
    return api.get('/api/system/users', { query: { page: 1, pageSize: 100, status: 1 } }) as Result<
      PaginatedData<UserItem>
    >;
  },
  departments(): Result<DeptItem[]> {
    return api.get('/api/system/depts/tree') as Result<DeptItem[]>;
  },
  menus(applicationId: string): Result<OAuthApplicationMenu[]> {
    return api.get('/api/oauth/admin/applications/:applicationId/menus', {
      params: { applicationId },
    }) as Result<OAuthApplicationMenu[]>;
  },
  createMenu(applicationId: string, body: Record<string, unknown>): Result<{ id: string }> {
    return api.post('/api/oauth/admin/applications/:applicationId/menus', {
      params: { applicationId },
      body,
    }) as Result<{ id: string }>;
  },
  updateMenu(applicationId: string, id: string, body: Record<string, unknown>): Result<null> {
    return api.put('/api/oauth/admin/applications/:applicationId/menus/:id', {
      params: { applicationId, id },
      body,
    }) as Result<null>;
  },
  deleteMenu(applicationId: string, id: string): Result<null> {
    return api.delete('/api/oauth/admin/applications/:applicationId/menus/:id', {
      params: { applicationId, id },
    }) as Result<null>;
  },
  uploadIcon(id: string, file: File): Result<{ iconUrl: string }> {
    const body = new FormData();
    body.append('file', file);
    return api.post('/api/oauth/admin/applications/:id/icon', {
      params: { id },
      body,
    }) as Result<{ iconUrl: string }>;
  },
  portal(search?: string): Result<OAuthPortalApplication[]> {
    return api.get('/api/oauth/portal/applications', { query: search ? { search } : {} }) as Result<
      OAuthPortalApplication[]
    >;
  },
  logs(
    query: Record<string, unknown>,
  ): Result<PaginatedData<import('@/api/types').OAuthAuthLogItem>> {
    return api.get('/api/oauth/logs', { query }) as Result<
      PaginatedData<import('@/api/types').OAuthAuthLogItem>
    >;
  },
};
