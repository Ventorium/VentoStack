/**
 * @ventostack/system - UserService
 * 用户管理服务：创建、更新、删除、查询、密码重置、状态变更
 */

import type { Cache } from "@ventostack/cache";
import type { PasswordHasher } from "@ventostack/auth";
import type { Database } from "@ventostack/database";
import type { ConfigService } from "./config";
import { validatePassword } from "./password-policy";
import { UserModel } from "../models/user";
import { DeptModel } from "../models/dept";

/** 创建用户参数 */
export interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  nickname?: string;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 更新用户参数 */
export interface UpdateUserParams {
  email?: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  gender?: number;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 用户详情 */
export interface UserDetail {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  gender: number | null;
  status: number;
  deptId: string | null;
  mfaEnabled: boolean;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 用户列表项 */
export interface UserListItem {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  status: number;
  deptId: string | null;
  createdAt: string;
}

/** 用户列表查询参数 */
export interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  deptId?: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 用户服务接口 */
export interface UserService {
  create(params: CreateUserParams): Promise<{ id: string }>;
  update(id: string, params: UpdateUserParams): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<UserDetail | null>;
  list(params: UserListParams): Promise<PaginatedResult<UserListItem>>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  updateStatus(id: string, status: number): Promise<void>;
  export(params?: UserListParams): Promise<string>;
}

/**
 * 递归收集指定部门及其所有子部门 ID
 */
async function collectDescendantDeptIds(db: Database, parentId: string): Promise<string[]> {
  const rows = await db.query(DeptModel)
    .select("id", "parent_id")
    .list();

  const childrenMap = new Map<string, string[]>();
  for (const row of rows) {
    const pid = row.parent_id;
    if (pid) {
      const children = childrenMap.get(pid) ?? [];
      children.push(row.id);
      childrenMap.set(pid, children);
    }
  }

  const result: string[] = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenMap.get(current) ?? []) {
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

/**
 * 创建用户服务实例
 * @param deps 依赖项
 * @returns 用户服务实例
 */
export function createUserService(deps: {
  db: Database;
  passwordHasher: PasswordHasher;
  cache: Cache;
  configService: ConfigService;
}): UserService {
  const { db, passwordHasher, cache, configService } = deps;

  return {
    async create(params) {
      const {
        username,
        password,
        email,
        phone,
        nickname,
        deptId,
        status,
        remark,
      } = params;
      const id = crypto.randomUUID();

      // 密码：若未提供则使用系统默认初始密码
      let actualPassword = password;
      if (!actualPassword) {
        actualPassword = (await configService.getValue('sys_user_init_password')) || '123456';
      }

      // 密码策略校验
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity = (await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high' || 'low';
      const validation = validatePassword(actualPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(actualPassword);

      await db.query(UserModel).insert({
        id,
        username,
        password_hash: passwordHash,
        email: email ?? null,
        phone: phone ?? null,
        nickname: nickname ?? null,
        dept_id: deptId ?? null,
        status: status ?? 1,
        remark: remark ?? null,
        mfa_enabled: false,
        password_changed_at: new Date(),
      });

      // 清除用户列表缓存
      await cache.del("user:list");

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.email !== undefined) updates.email = params.email;
      if (params.phone !== undefined) updates.phone = params.phone;
      if (params.nickname !== undefined) updates.nickname = params.nickname;
      if (params.avatar !== undefined) updates.avatar = params.avatar;
      if (params.gender !== undefined) updates.gender = params.gender;
      if (params.deptId !== undefined) updates.dept_id = params.deptId;
      if (params.status !== undefined) updates.status = params.status;
      if (params.remark !== undefined) updates.remark = params.remark;

      if (Object.keys(updates).length === 0) return;

      await db.query(UserModel).where("id", "=", id).update(updates);

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async delete(id) {
      // 软删除
      await db.query(UserModel).where("id", "=", id).delete();

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async getById(id) {
      // 尝试从缓存获取
      const cached = await cache.get<UserDetail>(`user:detail:${id}`);
      if (cached) return cached;

      const row = await db.query(UserModel)
        .where("id", "=", id)
        .select("id", "username", "email", "phone", "nickname", "avatar", "gender",
                "status", "dept_id", "mfa_enabled", "remark", "created_at", "updated_at")
        .get();

      if (!row) return null;

      const detail: UserDetail = {
        id: row.id,
        username: row.username,
        email: row.email ?? null,
        phone: row.phone ?? null,
        nickname: row.nickname ?? null,
        avatar: row.avatar ?? null,
        gender: row.gender ?? null,
        status: row.status,
        deptId: row.dept_id ?? null,
        mfaEnabled: row.mfa_enabled,
        remark: row.remark ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };

      // 写入缓存
      await cache.set(`user:detail:${id}`, detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, username, status, deptId } = params;

      let query = db.query(UserModel);

      if (username) {
        query = query.where("username", "LIKE", `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where("status", "=", status);
      }
      if (deptId) {
        const deptIds = await collectDescendantDeptIds(db, deptId);
        query = query.where("dept_id", "IN", deptIds);
      }

      const total = await query.count();

      const rows = await query
        .select("id", "username", "nickname", "email", "phone", "status", "dept_id", "created_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const list = rows.map((row) => ({
        id: row.id,
        username: row.username,
        nickname: row.nickname ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        status: row.status,
        deptId: row.dept_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return { items: list, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async resetPassword(id, newPassword) {
      // 密码策略校验
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity = (await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high' || 'low';
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(newPassword);

      await db.query(UserModel).where("id", "=", id).update({
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
    },

    async updateStatus(id, status) {
      await db.query(UserModel).where("id", "=", id).update({ status });

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async export(params) {
      const { username, status, deptId } = params ?? {};

      let query = db.query(UserModel);

      if (username) {
        query = query.where("username", "LIKE", `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where("status", "=", status);
      }
      if (deptId) {
        query = query.where("dept_id", "=", deptId);
      }

      const rows = await query
        .select("id", "username", "nickname", "email", "phone", "status", "dept_id", "created_at", "updated_at")
        .orderBy("created_at", "desc")
        .list();

      // 生成 CSV
      const header = "ID,用户名,昵称,邮箱,手机,状态,部门ID,创建时间,更新时间";
      const csvRows = rows.map((row) => {
        const escapeCsv = (val: unknown) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        return [
          escapeCsv(row.id),
          escapeCsv(row.username),
          escapeCsv(row.nickname),
          escapeCsv(row.email),
          escapeCsv(row.phone),
          escapeCsv(row.status),
          escapeCsv(row.dept_id),
          escapeCsv(row.created_at),
          escapeCsv(row.updated_at),
        ].join(",");
      });

      return [header, ...csvRows].join("\n");
    },
  };
}
