/**
 * @ventostack/system - UserService
 * 用户管理服务：创建、更新、删除、查询、密码重置、状态变更
 */

import type { PasswordHasher } from '@ventostack/auth';
import type { Cache } from '@ventostack/cache';
import type { Database } from '@ventostack/database';
import { DeptModel } from '../models/dept';
import { PostModel, UserPostModel } from '../models/post';
import { RoleModel, UserRoleModel } from '../models/role';
import { UserModel } from '../models/user';
import { createCacheKeyNamespace } from './cache-key';
import type { CacheKeyNamespace } from './cache-key';
import type { ConfigService } from './config';
import type { ResolvedDataScope } from './data-scope';
import { validatePassword } from './password-policy';

/** 创建用户参数 */
export interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  nickname?: string;
  deptId?: string;
  /** 岗位 ID 列表 */
  postIds?: string[];
  /** 角色 ID 列表 */
  roleIds?: string[];
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
  /** 岗位 ID 列表 */
  postIds?: string[];
  /** 角色 ID 列表 */
  roleIds?: string[];
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
  /** 岗位列表 */
  posts: Array<{ id: string; name: string; code: string }>;
  /** 角色列表 */
  roles: Array<{ id: string; name: string; code: string }>;
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
  tags?: Array<{ id: string; name: string; code: string }>;
  /** 岗位列表 */
  posts?: Array<{ id: string; name: string; code: string }>;
  /** 角色列表 */
  roles?: Array<{ id: string; name: string; code: string }>;
  createdAt: string;
}

/** 用户列表查询参数 */
export interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  deptId?: string;
  /** 由路由层统一解析的数据访问范围；内部任务可省略 */
  dataScope?: ResolvedDataScope;
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
  const rows = await db.query(DeptModel).select('id', 'parent_id').list();

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
  /** 租户 ID，启用多租户时传入以隔离缓存 */
  tenantId?: string;
}): UserService {
  const { db, passwordHasher, cache, configService } = deps;
  const ns: CacheKeyNamespace = createCacheKeyNamespace(deps.tenantId);

  /** 校验岗位 ID 均存在且启用，返回无效的岗位 ID */
  async function findInvalidPostIds(postIds: string[]): Promise<string[]> {
    if (postIds.length === 0) return [];
    const rows = await db
      .query(PostModel)
      .where('id', 'IN', postIds)
      .where('status', '=', 1)
      .select('id')
      .list();
    const valid = new Set(rows.map((row) => row.id));
    return postIds.filter((id) => !valid.has(id));
  }

  /** 覆盖用户的岗位关联（单条 CTE：DELETE+INSERT+ON CONFLICT，避免 Bun.sql 多连接池禁止 BEGIN/COMMIT 的限制） */
  async function assignUserPosts(userId: string, postIds: string[]): Promise<void> {
    if (postIds.length === 0) {
      await db.query(UserPostModel).where('user_id', '=', userId).hardDelete();
      return;
    }
    const placeholders = postIds.map((_, i) => `$${i * 2 + 2}`).join(', ');
    const params: string[] = [userId];
    for (const postId of postIds) params.push(postId);
    await db.raw(
      `WITH d AS (DELETE FROM sys_user_post WHERE user_id = $1 RETURNING user_id)
       INSERT INTO sys_user_post (user_id, post_id)
       SELECT $1, unnest(ARRAY[${placeholders}]::varchar[])
       WHERE EXISTS (SELECT 1 FROM d)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      params,
    );
  }

  /** 校验角色 ID 均存在且启用，返回无效的角色 ID */
  async function findInvalidRoleIds(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows = await db
      .query(RoleModel)
      .where('id', 'IN', roleIds)
      .where('status', '=', 1)
      .select('id')
      .list();
    const valid = new Set(rows.map((row) => row.id));
    return roleIds.filter((id) => !valid.has(id));
  }

  /** 覆盖用户的角色关联（单条 CTE：DELETE+INSERT+ON CONFLICT，避免 BEGIN/COMMIT 限制） */
  async function assignUserRoles(userId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) {
      await db.query(UserRoleModel).where('user_id', '=', userId).hardDelete();
      return;
    }
    const placeholders = roleIds.map((_, i) => `$${i * 2 + 2}`).join(', ');
    const params: string[] = [userId];
    for (const roleId of roleIds) params.push(roleId);
    await db.raw(
      `WITH d AS (DELETE FROM sys_user_role WHERE user_id = $1 RETURNING user_id)
       INSERT INTO sys_user_role (user_id, role_id)
       SELECT $1, unnest(ARRAY[${placeholders}]::varchar[])
       WHERE EXISTS (SELECT 1 FROM d)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      params,
    );
  }

  /** 查询用户角色 */
  async function getUserRoles(
    userIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string; code: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string; code: string }>>();
    if (userIds.length === 0) return map;
    const placeholders = userIds.map((_, i) => `$${i + 1}`);
    const rows = await db.raw(
      `SELECT ur.user_id, r.id, r.name, r.code
       FROM sys_user_role ur
       JOIN sys_role r ON r.id = ur.role_id
       WHERE ur.user_id IN (${placeholders.join(', ')}) AND r.deleted_at IS NULL`,
      userIds,
    );
    for (const row of rows as Array<{ user_id: string; id: string; name: string; code: string }>) {
      const arr = map.get(row.user_id) ?? [];
      arr.push({ id: row.id, name: row.name, code: row.code });
      map.set(row.user_id, arr);
    }
    return map;
  }

  /** 查询用户岗位 */
  async function getUserPosts(
    userIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string; code: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string; code: string }>>();
    if (userIds.length === 0) return map;
    const placeholders = userIds.map((_, i) => `$${i + 1}`);
    const rows = await db.raw(
      `SELECT up.user_id, p.id, p.name, p.code
       FROM sys_user_post up
       JOIN sys_post p ON p.id = up.post_id
       WHERE up.user_id IN (${placeholders.join(', ')}) AND p.deleted_at IS NULL`,
      userIds,
    );
    for (const r of rows as Array<{ user_id: string; id: string; name: string; code: string }>) {
      const arr = map.get(r.user_id) ?? [];
      arr.push({ id: r.id, name: r.name, code: r.code });
      map.set(r.user_id, arr);
    }
    return map;
  }

  return {
    async create(params) {
      const { username, password, email, phone, nickname, deptId, status, remark } = params;
      const id = crypto.randomUUID();

      // 校验 + 去重岗位 ID（在事务前一次性做完，避免事务内浪费连接）
      const dedupPostIds = params.postIds ? [...new Set(params.postIds)] : undefined;
      const invalidPosts = await findInvalidPostIds(dedupPostIds ?? []);
      if (invalidPosts.length > 0) {
        throw new Error(`岗位不存在或已停用: ${invalidPosts.join(', ')}`);
      }

      // 校验 + 去重角色 ID
      const dedupRoleIds = params.roleIds ? [...new Set(params.roleIds)] : undefined;
      const invalidRoles = await findInvalidRoleIds(dedupRoleIds ?? []);
      if (invalidRoles.length > 0) {
        throw new Error(`角色不存在或已停用: ${invalidRoles.join(', ')}`);
      }

      // 密码：若未提供则使用系统默认初始密码
      let actualPassword = password;
      if (!actualPassword) {
        actualPassword = (await configService.getValue('sys_user_init_password')) || '123456';
      }

      // 密码策略校验
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity =
        ((await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high') ||
        'low';
      const validation = validatePassword(actualPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(actualPassword);

      // 注：Bun.sql 多连接池禁止事务里 BEGIN/COMMIT，所以 sys_user insert + sys_user_post
      // 覆盖写拆为两条串行 SQL；DELETE+INSERT 合并到 assignUserPosts 内部单条 CTE 保证原子。
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
      if (dedupPostIds) {
        await assignUserPosts(id, dedupPostIds);
      }
      if (dedupRoleIds) {
        await assignUserRoles(id, dedupRoleIds);
      }

      // 清除用户列表缓存
      await cache.del(ns.listKey('user'));

      return { id };
    },

    async update(id, params) {
      // 校验岗位 ID（去重 + 上限保护，防止 IN 列表过长 / PK 冲突）
      const dedupPostIds = params.postIds ? [...new Set(params.postIds)] : undefined;
      const invalidPosts = await findInvalidPostIds(dedupPostIds ?? []);
      if (invalidPosts.length > 0) {
        throw new Error(`岗位不存在或已停用: ${invalidPosts.join(', ')}`);
      }

      // 校验角色 ID
      const dedupRoleIds = params.roleIds ? [...new Set(params.roleIds)] : undefined;
      const invalidRoles = await findInvalidRoleIds(dedupRoleIds ?? []);
      if (invalidRoles.length > 0) {
        throw new Error(`角色不存在或已停用: ${invalidRoles.join(', ')}`);
      }

      const updates: Record<string, unknown> = {};
      if (params.email !== undefined) updates.email = params.email;
      if (params.phone !== undefined) updates.phone = params.phone;
      if (params.nickname !== undefined) updates.nickname = params.nickname;
      if (params.avatar !== undefined) updates.avatar = params.avatar;
      if (params.gender !== undefined) updates.gender = params.gender;
      if (params.deptId !== undefined) updates.dept_id = params.deptId;
      if (params.status !== undefined) updates.status = params.status;
      if (params.remark !== undefined) updates.remark = params.remark;

      // 当既无字段需要更新、也不调整岗位/角色时，直接返回
      if (
        Object.keys(updates).length === 0 &&
        dedupPostIds === undefined &&
        dedupRoleIds === undefined
      )
        return;

      // 注：Bun.sql 多连接池禁止事务里 BEGIN/COMMIT，sys_user update + sys_user_post
      // 覆盖写拆为两条串行 SQL；DELETE+INSERT 合并到 assignUserPosts 内部单条 CTE 保证原子。
      if (Object.keys(updates).length > 0) {
        await db.query(UserModel).where('id', '=', id).update(updates);
      }
      if (dedupPostIds !== undefined) {
        await assignUserPosts(id, dedupPostIds);
      }
      if (dedupRoleIds !== undefined) {
        await assignUserRoles(id, dedupRoleIds);
      }

      // 清除用户缓存
      await cache.del(ns.detailKey('user', id));
      await cache.del(ns.listKey('user'));
    },

    async delete(id) {
      // 软删除
      await db.query(UserModel).where('id', '=', id).delete();

      // 清除缓存
      await cache.del(ns.detailKey('user', id));
      await cache.del(ns.listKey('user'));
    },

    async getById(id) {
      // 尝试从缓存获取
      const cached = await cache.get<UserDetail>(ns.detailKey('user', id));
      if (cached) return cached;

      const row = await db
        .query(UserModel)
        .where('id', '=', id)
        .select(
          'id',
          'username',
          'email',
          'phone',
          'nickname',
          'avatar',
          'gender',
          'status',
          'dept_id',
          'mfa_enabled',
          'remark',
          'created_at',
          'updated_at',
        )
        .get();

      if (!row) return null;

      const postMap = await getUserPosts([id]);
      const roleMap = await getUserRoles([id]);
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
        posts: postMap.get(id) ?? [],
        roles: roleMap.get(id) ?? [],
        mfaEnabled: row.mfa_enabled,
        remark: row.remark ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt:
          row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };

      // 写入缓存
      await cache.set(ns.detailKey('user', id), detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, username, status, deptId, dataScope } = params;

      let query = db.query(UserModel);

      if (username) {
        query = query.where('username', 'LIKE', `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where('status', '=', status);
      }
      if (deptId === '__none__') {
        query = query.where('dept_id', 'IS NULL');
      } else if (deptId) {
        const deptIds = await collectDescendantDeptIds(db, deptId);
        query = query.where('dept_id', 'IN', deptIds);
      }
      if (dataScope && !dataScope.all) {
        if (dataScope.departmentIds.length > 0) {
          query = query.where('dept_id', 'IN', dataScope.departmentIds);
          if (dataScope.self) query = query.orWhere('id', '=', dataScope.userId);
        } else if (dataScope.self) {
          query = query.where('id', '=', dataScope.userId);
        } else {
          query = query.where('id', '=', '__data_scope_denied__');
        }
      }

      const total = await query.count();

      const rows = await query
        .select('id', 'username', 'nickname', 'email', 'phone', 'status', 'dept_id', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const list: Array<{
        id: string;
        username: string;
        nickname: string | null;
        email: string | null;
        phone: string | null;
        status: number;
        deptId: string | null;
        createdAt: string;
        tags: Array<{ id: string; name: string; code: string }>;
        posts: Array<{ id: string; name: string; code: string }>;
        roles: Array<{ id: string; name: string; code: string }>;
      }> = rows.map((row) => ({
        id: row.id,
        username: row.username,
        nickname: row.nickname ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        status: row.status,
        deptId: row.dept_id ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        tags: [],
        posts: [],
        roles: [],
      }));

      // 批量获取用户标签、岗位与角色
      const tagMap = new Map<string, Array<{ id: string; name: string; code: string }>>();
      let postMap = new Map<string, Array<{ id: string; name: string; code: string }>>();
      let roleMap = new Map<string, Array<{ id: string; name: string; code: string }>>();
      if (list.length > 0) {
        const userIds = list.map((u) => u.id);
        const placeholders = userIds.map((_, i) => `$${i + 1}`);
        const tagRows = await db.raw(
          `SELECT ut.user_id, t.id, t.name, t.code
           FROM sys_user_tag ut
           JOIN sys_tag t ON t.id = ut.tag_id
           WHERE ut.user_id IN (${placeholders.join(', ')}) AND t.status = 1 AND t.deleted_at IS NULL`,
          userIds,
        );
        for (const tr of tagRows as Array<{
          user_id: string;
          id: string;
          name: string;
          code: string;
        }>) {
          const arr = tagMap.get(tr.user_id) ?? [];
          arr.push({ id: tr.id, name: tr.name, code: tr.code });
          tagMap.set(tr.user_id, arr);
        }
        postMap = await getUserPosts(userIds);
        roleMap = await getUserRoles(userIds);
        for (const item of list) {
          item.tags = tagMap.get(item.id) ?? [];
          item.posts = postMap.get(item.id) ?? [];
          item.roles = roleMap.get(item.id) ?? [];
        }
      }

      return {
        items: list,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      };
    },

    async resetPassword(id, newPassword) {
      // 密码策略校验
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity =
        ((await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high') ||
        'low';
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(newPassword);

      await db.query(UserModel).where('id', '=', id).update({
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      // 清除用户缓存
      await cache.del(ns.detailKey('user', id));
    },

    async updateStatus(id, status) {
      await db.query(UserModel).where('id', '=', id).update({ status });

      // 清除缓存
      await cache.del(ns.detailKey('user', id));
      await cache.del(ns.listKey('user'));
    },

    async export(params) {
      const { username, status, deptId, dataScope } = params ?? {};

      let query = db.query(UserModel);

      if (username) {
        query = query.where('username', 'LIKE', `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where('status', '=', status);
      }
      if (deptId === '__none__') {
        query = query.where('dept_id', 'IS NULL');
      } else if (deptId) {
        query = query.where('dept_id', '=', deptId);
      }
      if (dataScope && !dataScope.all) {
        if (dataScope.departmentIds.length > 0) {
          query = query.where('dept_id', 'IN', dataScope.departmentIds);
          if (dataScope.self) query = query.orWhere('id', '=', dataScope.userId);
        } else if (dataScope.self) query = query.where('id', '=', dataScope.userId);
        else query = query.where('id', '=', '__data_scope_denied__');
      }

      const rows = await query
        .select(
          'id',
          'username',
          'nickname',
          'email',
          'phone',
          'status',
          'dept_id',
          'created_at',
          'updated_at',
        )
        .orderBy('created_at', 'desc')
        .list();

      // 生成 CSV
      const header = 'ID,用户名,昵称,邮箱,手机,状态,部门ID,创建时间,更新时间';
      const csvRows = rows.map((row) => {
        const escapeCsv = (val: unknown) => {
          if (val === null || val === undefined) return '';
          let str = String(val);
          // 公式注入防护：以 = + - @ 开头的单元格值前置单引号，防止 Excel/WPS 执行恶意公式
          if (/^[=+\-@]/.test(str)) {
            str = `'${str}`;
          }
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
        ].join(',');
      });

      return [header, ...csvRows].join('\n');
    },
  };
}
