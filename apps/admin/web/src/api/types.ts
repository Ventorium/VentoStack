/* 业务类型定义 — 纯类型，不含 API 调用 */

export type { PaginatedData, PaginatedParams } from "../hooks/useTable";

export type CreateNoticeBody = { title: string; content: string; type: string };
export type UpdateNoticeBody = { title?: string; content?: string; type?: string };

export interface UserItem {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
  gender: number;
  status: number;
  deptId: string;
  deptName?: string;
  roles: Array<{ id: string; name: string; code: string }>;
  posts: Array<{ id: string; name: string; code: string }>;
  mfaEnabled: boolean;
  lockedUntil?: string | null;
  blacklisted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  dataScope: number;
  status: number;
  remark: string;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  component: string;
  redirect: string;
  type: string;
  permission: string;
  icon: string;
  sort: number;
  visible: number;
  status: number;
  createdAt: string;
  children: MenuItem[];
}

export interface DeptItem {
  id: string;
  parentId: string | null;
  name: string;
  sort: number;
  leader: string;
  phone: string;
  email: string;
  status: number;
  createdAt: string;
  children: DeptItem[];
}

export interface PostItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
  createdAt: string;
}

export interface DictTypeItem {
  id: string;
  name: string;
  code: string;
  isSystem: boolean;
  sort: number;
  status: number;
  remark: string;
  createdAt: string;
}

export interface DictDataItem {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  sort: number;
  cssClass: string;
  isSystem: boolean;
  status: number;
  remark: string;
  createdAt: string;
}

export interface ConfigItem {
  id: string;
  name: string;
  key: string;
  value: string;
  type: number;
  group: string;
  remark: string;
  createdAt: string;
}

export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  status: number;
  publisherId: string;
  publishAt: string;
  createdAt: string;
}

export interface OperationLogItem {
  id: string;
  userId: string;
  username: string;
  module: string;
  action: string;
  method: string;
  url: string;
  ip: string;
  params: string;
  result: number;
  errorMsg: string;
  duration: number;
  createdAt: string;
}

export interface LoginLogItem {
  id: string;
  userId?: string;
  username: string;
  ip: string;
  location: string;
  browser: string;
  os: string;
  status: number;
  message: string;
  loginAt: string;
  loginMethod: string;
}

export interface FrontendRoute {
  name: string;
  path: string;
  component?: string;
  redirect?: string;
  meta: { title: string; icon?: string; hidden?: boolean; permissions?: string[] };
  children?: FrontendRoute[];
}

// ===== 定时任务 =====
export interface ScheduleJob {
  id: string;
  name: string;
  cron: string;
  handlerId: string;
  params: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleJobLog {
  id: string;
  jobId: string;
  jobName: string;
  startAt: string;
  endAt: string;
  status: string;
  result: string;
  error: string;
  durationMs: number;
}

// ===== 文件管理 =====
export interface OSSFile {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  uploaderId: string;
  uploaderName?: string;
  bucket: string;
  createdAt: string;
}

// ===== 系统监控 =====
export interface ServerCpuInfo {
  model: string;
  cores: number;
  usage: number;
}
export interface ServerMemoryInfo {
  total: number;
  used: number;
  usage: number;
}
export interface ServerDiskInfo {
  total: number;
  used: number;
  usage: number;
  mount: string;
}
export interface ServerOsInfo {
  platform: string;
  arch: string;
  hostname: string;
}
export interface ServerProcessInfo {
  pid: number;
  uptime: number;
  bunVersion: string;
  nodeVersion: string;
}
export interface ServerStatus {
  cpu: ServerCpuInfo;
  memory: ServerMemoryInfo;
  disk: ServerDiskInfo;
  os: ServerOsInfo;
  process: ServerProcessInfo;
}

export interface CacheStatus {
  keyCount: number;
  hitRate?: number;
  memory: string;
  uptime?: string;
  version?: string;
}

export interface DataSourceStatus {
  connected: boolean;
  poolSize: number;
  activeConnections: number;
  idleConnections: number;
}

export interface HealthCheckItem {
  name: string;
  status: string;
  details?: string;
  duration?: number;
}

export interface HealthStatus {
  status: string;
  checks: HealthCheckItem[];
}

// ===== 消息中心 =====
export interface NotifyMessage {
  id: string;
  receiverId: string;
  channel: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
}

export interface NotifyTemplate {
  id: string;
  name: string;
  code: string;
  channel: string;
  title: string | null;
  content: string;
  status: number;
  createdAt?: string;
}

// ===== 在线用户 =====
export interface OnlineUser {
  sessionId: string;
  userId: string;
  username: string;
  nickname: string;
  ip: string;
  browser: string;
  os: string;
  loginAt: string;
  lastAccessAt: string;
}
