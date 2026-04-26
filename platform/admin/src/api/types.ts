/* ========== 通用类型 ========== */

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface PaginatedParams {
  page?: number
  pageSize?: number
}

/* ========== 用户管理 ========== */

export interface UserItem {
  id: string
  username: string
  nickname: string
  email: string
  phone: string
  avatar: string
  gender: number
  status: number
  deptId: string
  deptName?: string
  roles: Array<{ id: string; name: string; code: string }>
  posts: Array<{ id: string; name: string; code: string }>
  mfaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserListParams extends PaginatedParams {
  username?: string
  phone?: string
  status?: number
  deptId?: string
}

export interface CreateUserBody {
  username: string
  password: string
  nickname?: string
  email?: string
  phone?: string
  deptId?: string
  postIds?: string[]
  roleIds?: string[]
  status?: number
  remark?: string
}

export interface UpdateUserBody {
  nickname?: string
  email?: string
  phone?: string
  deptId?: string
  postIds?: string[]
  roleIds?: string[]
  status?: number
  remark?: string
  avatar?: string
}

/* ========== 角色管理 ========== */

export interface RoleItem {
  id: string
  name: string
  code: string
  sort: number
  dataScope: number
  status: number
  remark: string
  createdAt: string
  updatedAt: string
}

export interface RoleListParams extends PaginatedParams {
  name?: string
  status?: number
}

export interface CreateRoleBody {
  name: string
  code: string
  sort?: number
  dataScope?: number
  remark?: string
}

export interface UpdateRoleBody {
  name?: string
  sort?: number
  dataScope?: number
  remark?: string
  status?: number
}

/* ========== 菜单管理 ========== */

export type MenuType = 1 | 2 | 3 // 1=目录 2=菜单 3=按钮

export interface MenuItem {
  id: string
  parentId: string | null
  name: string
  path: string
  component: string
  redirect: string
  type: MenuType
  permission: string
  icon: string
  sort: number
  visible: boolean
  status: number
  children: MenuItem[]
  createdAt: string
  updatedAt: string
}

export interface CreateMenuBody {
  parentId?: string
  name: string
  path?: string
  component?: string
  redirect?: string
  type: MenuType
  permission?: string
  icon?: string
  sort?: number
  visible?: boolean
  status?: number
}

export interface UpdateMenuBody {
  parentId?: string
  name?: string
  path?: string
  component?: string
  redirect?: string
  type?: MenuType
  permission?: string
  icon?: string
  sort?: number
  visible?: boolean
  status?: number
}

/* ========== 部门管理 ========== */

export interface DeptItem {
  id: string
  parentId: string | null
  name: string
  sort: number
  leader: string
  phone: string
  email: string
  status: number
  children: DeptItem[]
  createdAt: string
}

export type CreateDeptBody = {
  parentId?: string
  name: string
  sort?: number
  leader?: string
  phone?: string
  email?: string
  status?: number
}

export type UpdateDeptBody = Partial<CreateDeptBody>

/* ========== 岗位管理 ========== */

export interface PostItem {
  id: string
  name: string
  code: string
  sort: number
  status: number
  remark: string
  createdAt: string
}

export interface PostListParams extends PaginatedParams {
  name?: string
  status?: number
}

export interface CreatePostBody {
  name: string
  code: string
  sort?: number
  status?: number
  remark?: string
}

export type UpdatePostBody = Partial<CreatePostBody>

/* ========== 字典管理 ========== */

export interface DictTypeItem {
  id: string
  name: string
  code: string
  status: number
  remark: string
  createdAt: string
}

export interface DictDataItem {
  id: string
  typeCode: string
  label: string
  value: string
  sort: number
  cssClass: string
  status: number
  remark: string
  createdAt: string
}

export interface DictTypeListParams extends PaginatedParams {
  name?: string
  code?: string
  status?: number
}

export interface CreateDictTypeBody {
  name: string
  code: string
  remark?: string
}

export interface UpdateDictTypeBody {
  name?: string
  remark?: string
  status?: number
}

export interface CreateDictDataBody {
  typeCode: string
  label: string
  value: string
  sort?: number
  cssClass?: string
  status?: number
  remark?: string
}

export type UpdateDictDataBody = Partial<CreateDictDataBody>

/* ========== 系统参数 ========== */

export interface ConfigItem {
  id: string
  name: string
  key: string
  value: string
  type: number
  group: string
  remark: string
  createdAt: string
}

export interface ConfigListParams extends PaginatedParams {
  name?: string
  key?: string
  group?: string
}

export interface CreateConfigBody {
  name: string
  key: string
  value: string
  type?: number
  group?: string
  remark?: string
}

export type UpdateConfigBody = {
  name?: string
  value?: string
  type?: number
  group?: string
  remark?: string
}

/* ========== 通知公告 ========== */

export interface NoticeItem {
  id: string
  title: string
  content: string
  type: number
  status: number
  publisherId: string
  publishAt: string
  createdAt: string
}

export interface NoticeListParams extends PaginatedParams {
  title?: string
  type?: number
  status?: number
}

export interface CreateNoticeBody {
  title: string
  content: string
  type: number
}

export type UpdateNoticeBody = {
  title?: string
  content?: string
  type?: number
}

/* ========== 日志 ========== */

export interface OperationLogItem {
  id: string
  userId: string
  username: string
  module: string
  action: string
  method: string
  url: string
  ip: string
  params: string
  result: number
  errorMsg: string
  duration: number
  createdAt: string
}

export interface LoginLogItem {
  id: string
  userId: string
  username: string
  ip: string
  location: string
  browser: string
  os: string
  status: number
  message: string
  loginAt: string
}

export interface LogListParams extends PaginatedParams {
  username?: string
  status?: number
}

/* ========== 认证相关 ========== */

export interface LoginBody {
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  sessionId: string
  mfaRequired: boolean
}

export interface UserProfile {
  id: string
  username: string
  nickname: string
  email: string
  phone: string
  avatar: string
  gender: number
  deptId: string
  deptName: string
  roles: string[]
  permissions: string[]
}

/* ========== 前端路由 ========== */

export interface FrontendRoute {
  name: string
  path: string
  component?: string
  redirect?: string
  meta: {
    title: string
    icon?: string
    hidden?: boolean
    permissions?: string[]
  }
  children?: FrontendRoute[]
}
