/**
 * @ventostack/system — 系统管理包
 *
 * 提供用户、角色、菜单、部门、岗位、字典、配置、通知、日志、MFA 等系统管理能力。
 * 包含数据模型定义、数据库迁移与初始种子数据。
 */

// Models
export { UserModel } from './models/user';
export { RoleModel, UserRoleModel } from './models/role';
export { MenuModel, RoleMenuModel } from './models/menu';
export { DeptModel } from './models/dept';
export { PostModel, UserPostModel } from './models/post';
export { DictTypeModel, DictDataModel } from './models/dict';
export { ConfigModel } from './models/config';
export { NoticeModel, UserNoticeModel } from './models/notice';
export { LoginLogModel, OperationLogModel } from './models/log';
export { MfaRecoveryModel } from './models/mfa-recovery';

// Services
export * from './services/index';

// Middlewares
export * from './middlewares/index';

// Routes
export { createAuthRoutes } from './routes/auth';
export { createUserRoutes } from './routes/user';
export { createCrudRoutes } from './routes/crud';
export { createPasskeyRoutes } from './routes/passkey';

// Module
export { createSystemModule } from './module';
export type { SystemModule, SystemModuleDeps } from './module';
