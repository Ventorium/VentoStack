/**
 * @ventostack/system - 服务层统一导出
 *
 * 提供系统管理的业务服务，包括：
 * - 认证服务（AuthService）：登录、登出、密码重置、MFA
 * - 用户服务（UserService）：用户 CRUD、状态管理
 * - 角色服务（RoleService）：角色 CRUD、菜单分配、数据范围
 * - 菜单服务（MenuService）：菜单 CRUD、树形结构
 * - 部门服务（DeptService）：部门 CRUD、树形结构
 * - 岗位服务（PostService）：岗位 CRUD、分页查询
 * - 字典服务（DictService）：字典类型与数据 CRUD、缓存
 * - 系统配置服务（ConfigService）：配置 CRUD、缓存刷新
 * - 通知公告服务（NoticeService）：通知 CRUD、发布/撤回、已读标记
 * - 权限加载器（PermissionLoader）：从数据库加载权限到 RBAC 引擎
 * - 菜单树构建器（MenuTreeBuilder）：生成前端路由树与权限列表
 */

// AuthService
export { createAuthService } from "./auth";
export type {
  LoginResult,
  MFASetupResult,
  AuthService,
} from "./auth";

// UserService
export { createUserService } from "./user";
export type {
  CreateUserParams,
  UpdateUserParams,
  UserDetail,
  UserListItem,
  UserListParams,
  PaginatedResult,
  UserService,
} from "./user";

// RoleService
export { createRoleService } from "./role";
export type {
  CreateRoleParams,
  RoleDetail,
  RoleListItem,
  RoleService,
} from "./role";

// MenuService
export { createMenuService } from "./menu";
export type {
  CreateMenuParams,
  MenuTreeNode,
  MenuService,
} from "./menu";

// DeptService
export { createDeptService } from "./dept";
export type {
  CreateDeptParams,
  UpdateDeptParams,
  DeptTreeNode,
  DeptService,
} from "./dept";

// PostService
export { createPostService } from "./post";
export type {
  CreatePostParams,
  UpdatePostParams,
  PostItem,
  PostListParams,
  PostService,
} from "./post";

// DictService
export { createDictService } from "./dict";
export type {
  CreateDictTypeParams,
  UpdateDictTypeParams,
  DictTypeItem,
  CreateDictDataParams,
  UpdateDictDataParams,
  DictDataItem,
  DictService,
} from "./dict";

// ConfigService
export { createConfigService } from "./config";
export type {
  CreateConfigParams,
  UpdateConfigParams,
  ConfigItem,
  ConfigListParams,
  ConfigService,
} from "./config";

// NoticeService
export { createNoticeService } from "./notice";
export type {
  CreateNoticeParams,
  UpdateNoticeParams,
  NoticeItem,
  NoticeListParams,
  NoticeService,
} from "./notice";

// PermissionLoader
export { createPermissionLoader } from "./permission-loader";
export type { PermissionLoader } from "./permission-loader";

// MenuTreeBuilder
export { createMenuTreeBuilder } from "./menu-tree-builder";
export type {
  FrontendRoute,
  RouteMeta,
  MenuTreeBuilder,
} from "./menu-tree-builder";

// PasskeyService
export { createPasskeyService } from "./passkey";
export type { PasskeyService } from "./passkey";

// PasswordPolicy
export { validatePassword } from "./password-policy";
export type { PasswordComplexity, PasswordPolicyOptions, PasswordValidationResult } from "./password-policy";
