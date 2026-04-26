import { client } from './index'
import type {
  PaginatedData,
  UserItem,
  UserListParams,
  CreateUserBody,
  UpdateUserBody,
  RoleItem,
  RoleListParams,
  CreateRoleBody,
  UpdateRoleBody,
  MenuItem,
  CreateMenuBody,
  UpdateMenuBody,
  DeptItem,
  CreateDeptBody,
  UpdateDeptBody,
  PostItem,
  PostListParams,
  CreatePostBody,
  UpdatePostBody,
  DictTypeItem,
  DictDataItem,
  DictTypeListParams,
  CreateDictTypeBody,
  UpdateDictTypeBody,
  CreateDictDataBody,
  UpdateDictDataBody,
  ConfigItem,
  ConfigListParams,
  CreateConfigBody,
  UpdateConfigBody,
  NoticeItem,
  NoticeListParams,
  CreateNoticeBody,
  UpdateNoticeBody,
  OperationLogItem,
  LoginLogItem,
  LogListParams,
  LoginBody,
  LoginResult,
  UserProfile,
  FrontendRoute,
} from './types'

// ========== 认证 ==========

export const authApi = {
  login(body: LoginBody) {
    return client.post<LoginResult>('/api/auth/login', { body })
  },
  logout() {
    return client.post<void>('/api/auth/logout')
  },
  refresh(refreshToken: string) {
    return client.post<LoginResult>('/api/auth/refresh', { body: { refreshToken } })
  },
  getProfile() {
    return client.get<UserProfile>('/api/system/user/profile')
  },
}

// ========== 用户管理 ==========

export const userApi = {
  list(params?: UserListParams) {
    return client.get<PaginatedData<UserItem>>('/api/system/users', { query: params })
  },
  getById(id: string) {
    return client.get<UserItem>(`/api/system/users/${id}`)
  },
  create(body: CreateUserBody) {
    return client.post<{ id: string }>('/api/system/users', { body })
  },
  update(id: string, body: UpdateUserBody) {
    return client.put<void>(`/api/system/users/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/users/${id}`)
  },
  resetPassword(id: string, newPassword: string) {
    return client.put<void>(`/api/system/users/${id}/reset-pwd`, { body: { newPassword } })
  },
  updateStatus(id: string, status: number) {
    return client.put<void>(`/api/system/users/${id}/status`, { body: { status } })
  },
}

// ========== 角色管理 ==========

export const roleApi = {
  list(params?: RoleListParams) {
    return client.get<PaginatedData<RoleItem>>('/api/system/roles', { query: params })
  },
  getById(id: string) {
    return client.get<RoleItem>(`/api/system/roles/${id}`)
  },
  create(body: CreateRoleBody) {
    return client.post<{ id: string }>('/api/system/roles', { body })
  },
  update(id: string, body: UpdateRoleBody) {
    return client.put<void>(`/api/system/roles/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/roles/${id}`)
  },
  assignMenus(roleId: string, menuIds: string[]) {
    return client.put<void>(`/api/system/roles/${roleId}/menus`, { body: { menuIds } })
  },
  assignDataScope(roleId: string, dataScope: number, deptIds?: string[]) {
    return client.put<void>(`/api/system/roles/${roleId}/data-scope`, { body: { dataScope, deptIds } })
  },
}

// ========== 菜单管理 ==========

export const menuApi = {
  getTree() {
    return client.get<MenuItem[]>('/api/system/menus')
  },
  getById(id: string) {
    return client.get<MenuItem>(`/api/system/menus/${id}`)
  },
  create(body: CreateMenuBody) {
    return client.post<{ id: string }>('/api/system/menus', { body })
  },
  update(id: string, body: UpdateMenuBody) {
    return client.put<void>(`/api/system/menus/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/menus/${id}`)
  },
  getRoutes() {
    return client.get<FrontendRoute[]>('/api/system/user/routes')
  },
  getPermissions() {
    return client.get<string[]>('/api/system/user/permissions')
  },
}

// ========== 部门管理 ==========

export const deptApi = {
  getTree() {
    return client.get<DeptItem[]>('/api/system/depts')
  },
  create(body: CreateDeptBody) {
    return client.post<{ id: string }>('/api/system/depts', { body })
  },
  update(id: string, body: UpdateDeptBody) {
    return client.put<void>(`/api/system/depts/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/depts/${id}`)
  },
}

// ========== 岗位管理 ==========

export const postApi = {
  list(params?: PostListParams) {
    return client.get<PaginatedData<PostItem>>('/api/system/posts', { query: params })
  },
  create(body: CreatePostBody) {
    return client.post<{ id: string }>('/api/system/posts', { body })
  },
  update(id: string, body: UpdatePostBody) {
    return client.put<void>(`/api/system/posts/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/posts/${id}`)
  },
}

// ========== 字典管理 ==========

export const dictApi = {
  listTypes(params?: DictTypeListParams) {
    return client.get<PaginatedData<DictTypeItem>>('/api/system/dict/types', { query: params })
  },
  createType(body: CreateDictTypeBody) {
    return client.post<{ id: string }>('/api/system/dict/types', { body })
  },
  updateType(code: string, body: UpdateDictTypeBody) {
    return client.put<void>(`/api/system/dict/types/${code}`, { body })
  },
  deleteType(code: string) {
    return client.delete<void>(`/api/system/dict/types/${code}`)
  },
  listDataByType(typeCode: string) {
    return client.get<DictDataItem[]>(`/api/system/dict/types/${typeCode}/data`)
  },
  createData(body: CreateDictDataBody) {
    return client.post<{ id: string }>('/api/system/dict/data', { body })
  },
  updateData(id: string, body: UpdateDictDataBody) {
    return client.put<void>(`/api/system/dict/data/${id}`, { body })
  },
  deleteData(id: string) {
    return client.delete<void>(`/api/system/dict/data/${id}`)
  },
}

// ========== 系统参数 ==========

export const configApi = {
  list(params?: ConfigListParams) {
    return client.get<PaginatedData<ConfigItem>>('/api/system/configs', { query: params })
  },
  getValue(key: string) {
    return client.get<string>(`/api/system/configs/${key}`)
  },
  create(body: CreateConfigBody) {
    return client.post<{ id: string }>('/api/system/configs', { body })
  },
  update(key: string, body: UpdateConfigBody) {
    return client.put<void>(`/api/system/configs/${key}`, { body })
  },
  delete(key: string) {
    return client.delete<void>(`/api/system/configs/${key}`)
  },
}

// ========== 通知公告 ==========

export const noticeApi = {
  list(params?: NoticeListParams) {
    return client.get<PaginatedData<NoticeItem>>('/api/system/notices', { query: params })
  },
  create(body: CreateNoticeBody) {
    return client.post<{ id: string }>('/api/system/notices', { body })
  },
  update(id: string, body: UpdateNoticeBody) {
    return client.put<void>(`/api/system/notices/${id}`, { body })
  },
  delete(id: string) {
    return client.delete<void>(`/api/system/notices/${id}`)
  },
  publish(id: string) {
    return client.put<void>(`/api/system/notices/${id}/publish`)
  },
  revoke(id: string) {
    return client.put<void>(`/api/system/notices/${id}/revoke`)
  },
  markRead(id: string) {
    return client.put<void>(`/api/system/notices/${id}/read`)
  },
}

// ========== 操作日志 ==========

export const logApi = {
  listOperationLogs(params?: LogListParams) {
    return client.get<PaginatedData<OperationLogItem>>('/api/system/operation-logs', { query: params })
  },
  listLoginLogs(params?: LogListParams) {
    return client.get<PaginatedData<LoginLogItem>>('/api/system/login-logs', { query: params })
  },
}
