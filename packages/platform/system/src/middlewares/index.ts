/**
 * @ventostack/system - 中间件统一导出
 *
 * 提供系统管理相关的中间件：
 * - 认证/权限中间件：统一从 @ventostack/auth 导出
 * - 操作日志中间件（createOperationLogMiddleware）：写操作审计记录
 */

export {
  createAuthMiddleware,
  createPermMiddleware,
  type AuthUser,
} from "@ventostack/auth";

export {
  createOperationLogMiddleware,
  type OperationLogOptions,
} from "./operation-log";
