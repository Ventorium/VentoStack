/* 业务类型定义 — 纯类型，不含 API 调用 */

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface UserItem {
  id: string; username: string; nickname: string; email: string; phone: string
  avatar: string; gender: number; status: number; deptId: string; deptName?: string
  roles: Array<{ id: string; name: string; code: string }>
  posts: Array<{ id: string; name: string; code: string }>
  mfaEnabled: boolean; createdAt: string; updatedAt: string
}

export interface RoleItem {
  id: string; name: string; code: string; sort: number; dataScope: number
  status: number; remark: string; createdAt: string
}

export interface MenuItem {
  id: string; parentId: string | null; name: string; path: string; component: string
  redirect: string; type: number; permission: string; icon: string; sort: number
  visible: boolean; status: number; children: MenuItem[]
}

export interface DeptItem {
  id: string; parentId: string | null; name: string; sort: number
  leader: string; phone: string; email: string; status: number; children: DeptItem[]
}

export interface PostItem {
  id: string; name: string; code: string; sort: number; status: number; remark: string; createdAt: string
}

export interface DictTypeItem {
  id: string; name: string; code: string; status: number; remark: string; createdAt: string
}

export interface DictDataItem {
  id: string; typeCode: string; label: string; value: string; sort: number
  cssClass: string; status: number; remark: string; createdAt: string
}

export interface ConfigItem {
  id: string; name: string; key: string; value: string; type: number; group: string; remark: string; createdAt: string
}

export interface NoticeItem {
  id: string; title: string; content: string; type: number; status: number
  publisherId: string; publishAt: string; createdAt: string
}

export interface OperationLogItem {
  id: string; userId: string; username: string; module: string; action: string
  method: string; url: string; ip: string; params: string; result: number
  errorMsg: string; duration: number; createdAt: string
}

export interface LoginLogItem {
  id: string; userId: string; username: string; ip: string; location: string
  browser: string; os: string; status: number; message: string; loginAt: string
}

export interface FrontendRoute {
  name: string; path: string; component?: string; redirect?: string
  meta: { title: string; icon?: string; hidden?: boolean; permissions?: string[] }
  children?: FrontendRoute[]
}
