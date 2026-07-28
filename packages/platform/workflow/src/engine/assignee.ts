/**
 * @ventostack/workflow — 审批人解析
 *
 * 根据节点配置和运行时上下文，解析出实际的审批人用户 ID 列表。
 * 有副作用：需要查询数据库。
 */

import type { Database } from '@ventostack/database';
import { workflowErrors } from './errors';
import type { EngineContext, GraphNode } from './graph';

/** 审批人配置 */
export interface AssigneeConfig {
  mode: 'fixed' | 'role' | 'department' | 'lookup' | 'form_field' | 'dept_tag';
  userIds?: string[];
  roleId?: string;
  deptId?: string;
  lookupKey?:
    | 'initiator_superior'
    | 'initiator_dept_leader'
    | 'initiator_dept_hr'
    | 'last_approver_superior';
  formField?: string;
  validation?: {
    mustHaveRole?: string;
    mustBeInDept?: string;
  };
  /** dept_tag 模式: 标签标识列表 */
  tagCodes?: string[];
  /** dept_tag 模式: 匹配模式 — and=且(全部满足) or=或(任一满足) */
  tagMatchMode?: 'and' | 'or';
  /** dept_tag 模式: 是否沿部门层级向上遍历 */
  deptTraversal?: boolean;
  /** dept_tag 模式: 最大遍历层级，0 或 undefined 表示不限 */
  traversalLevels?: number;
}

/** 审批节点 config */
export interface ApproveNodeConfig {
  strategy?: 'sequential' | 'parallel_and' | 'parallel_or' | 'percentage';
  percentage?: number;
  assignee?: AssigneeConfig;
  formPermission?: { visible: string[]; editable: string[]; required: string[] };
  actionButtons?: string[];
  counterSign?: boolean;
  rejectAction?: 'terminate' | 'return_to_previous' | 'return_to_start';
  onEmptyAssignee?: 'error' | 'skip' | 'escalate';
  timeout?: {
    hours: number;
    action: 'remind' | 'auto_approve' | 'auto_reject' | 'escalate';
  };
}

/** 审批人解析器 */
export interface AssigneeResolver {
  resolve(node: GraphNode, ctx: EngineContext): Promise<string[]>;
}

/**
 * 创建审批人解析器
 */
export function createAssigneeResolver(deps: { db: Database }): AssigneeResolver {
  const { db } = deps;

  async function resolve(node: GraphNode, ctx: EngineContext): Promise<string[]> {
    const config = node.config as unknown as ApproveNodeConfig | null;
    const assignee = config?.assignee;
    if (!assignee) return [];

    switch (assignee.mode) {
      case 'fixed':
        return assignee.userIds ?? [];

      case 'role': {
        if (!assignee.roleId) return [];
        const rows = await db.raw('SELECT user_id FROM sys_user_role WHERE role_id = $1', [
          assignee.roleId,
        ]);
        return (rows as Array<{ user_id: string }>).map((r) => r.user_id);
      }

      case 'department': {
        if (!assignee.deptId) return [];
        const rows = await db.raw('SELECT id FROM sys_user WHERE dept_id = $1 AND status = 1', [
          assignee.deptId,
        ]);
        return (rows as Array<{ id: string }>).map((r) => r.id);
      }

      case 'lookup': {
        // 需要解析发起人的上下级关系
        const initiator = await resolveInitiatorDetail(db, ctx.initiator.id);
        switch (assignee.lookupKey) {
          case 'initiator_superior':
            return initiator.superiorId ? [initiator.superiorId] : [];
          case 'initiator_dept_leader':
            return initiator.deptLeaderId ? [initiator.deptLeaderId] : [];
          case 'initiator_dept_hr': {
            // 查找发起人所在部门的 HR 角色用户
            if (!initiator.deptId) return [];
            const hrRows = await db.raw(
              `SELECT ur.user_id FROM sys_user_role ur
               JOIN sys_user u ON u.id = ur.user_id
               JOIN sys_role r ON r.id = ur.role_id
               WHERE u.dept_id = $1 AND r.code = 'hr' AND u.status = 1`,
              [initiator.deptId],
            );
            return (hrRows as Array<{ user_id: string }>).map((r) => r.user_id);
          }
          case 'last_approver_superior':
            // TODO: 需要从 history 找到上一审批人，Phase 2 实现
            return [];
          default:
            return [];
        }
      }

      case 'form_field': {
        const fieldKey = assignee.formField;
        if (!fieldKey) return [];
        const userId = ctx.formData[fieldKey] as string | undefined;
        if (!userId) return [];

        // 基础校验：用户存在且状态正常
        const user = await db.raw('SELECT id FROM sys_user WHERE id = $1 AND status = 1', [userId]);
        if (user.length === 0) throw workflowErrors.invalidAssignee();

        return [userId];
      }

      case 'dept_tag': {
        const { tagCodes, tagMatchMode = 'or', deptTraversal = false, traversalLevels } = assignee;
        if (!tagCodes?.length) return [];

        // 获取发起人所在部门
        const initiator = await resolveInitiatorDetail(db, ctx.initiator.id);
        if (!initiator.deptId) return [];

        // 获取部门祖先链：deptTraversal=false 时只查本部门
        const deptChain = deptTraversal
          ? await getDeptAncestorChain(db, initiator.deptId, traversalLevels ?? 0)
          : [initiator.deptId];

        // 批量查找所有部门下的有效用户（排除软删除）
        const allUsers = await db.raw(
          'SELECT id FROM sys_user WHERE dept_id = ANY($1) AND status = 1 AND deleted_at IS NULL',
          [deptChain],
        );
        if (allUsers.length === 0) return [];

        const allUserIds = (allUsers as Array<{ id: string }>).map((u) => u.id);

        // 批量获取这些用户的标签
        const userTagRows = await db.raw(
          `SELECT ut.user_id, t.code
           FROM sys_user_tag ut
           JOIN sys_tag t ON t.id = ut.tag_id
           WHERE ut.user_id = ANY($1) AND t.status = 1 AND t.deleted_at IS NULL`,
          [allUserIds],
        );

        // 按用户分组标签
        const userTagMap = new Map<string, Set<string>>();
        for (const row of userTagRows as Array<{ user_id: string; code: string }>) {
          const set = userTagMap.get(row.user_id) ?? new Set();
          set.add(row.code);
          userTagMap.set(row.user_id, set);
        }

        // 按匹配模式过滤
        const matchedUserIds = new Set<string>();
        for (const userId of allUserIds) {
          const userTags = userTagMap.get(userId);
          if (!userTags) continue;
          const matched =
            tagMatchMode === 'and'
              ? tagCodes.every((code) => userTags.has(code))
              : tagCodes.some((code) => userTags.has(code));
          if (matched) matchedUserIds.add(userId);
        }

        return [...matchedUserIds];
      }

      default:
        return [];
    }
  }

  return { resolve };
}

/** 发起人详细信息 */
export interface InitiatorDetail {
  id: string;
  name?: string;
  deptId?: string;
  roles?: string[];
  superiorId?: string;
  deptLeaderId?: string;
}

/**
 * 解析发起人详细信息（含上下级关系）
 */
export async function resolveInitiatorDetail(
  db: Database,
  userId: string,
): Promise<InitiatorDetail> {
  const user = await db.raw(
    'SELECT id, nickname, dept_id FROM sys_user WHERE id = $1 AND status = 1 AND deleted_at IS NULL',
    [userId],
  );
  if (user.length === 0) return { id: userId };

  const u = user[0] as { id: string; nickname: string; dept_id: string | null };
  const result: InitiatorDetail = {
    id: u.id,
    name: u.nickname ?? undefined,
    deptId: u.dept_id ?? undefined,
  };

  // 查找角色
  const roles = await db.raw(
    'SELECT r.code FROM sys_role r JOIN sys_user_role ur ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.deleted_at IS NULL',
    [userId],
  );
  result.roles = (roles as Array<{ code: string }>).map((r) => r.code);

  // 查找直属上级（通过 dept 的 leader 字段）
  if (u.dept_id) {
    const dept = await db.raw('SELECT leader FROM sys_dept WHERE id = $1 AND deleted_at IS NULL', [
      u.dept_id,
    ]);
    const [department] = dept as Array<{ leader?: string | null }>;
    if (department?.leader) {
      result.superiorId = department.leader;
      result.deptLeaderId = department.leader;
    }
  }

  return result;
}

/**
 * 获取部门祖先链（从当前部门向上遍历）
 * @param db 数据库实例
 * @param deptId 起始部门 ID
 * @param maxLevels 最大遍历层级，0 表示不限
 * @returns 部门 ID 数组（从当前部门到顶层）
 */
async function getDeptAncestorChain(
  db: Database,
  deptId: string,
  maxLevels: number,
): Promise<string[]> {
  const chain: string[] = [deptId];
  let currentId = deptId;
  let level = 0;

  while (maxLevels === 0 || level < maxLevels) {
    const rows = await db.raw(
      'SELECT parent_id FROM sys_dept WHERE id = $1 AND deleted_at IS NULL',
      [currentId],
    );
    if (rows.length === 0) break;
    const parentId = (rows[0] as { parent_id: string | null }).parent_id;
    if (!parentId) break;
    chain.push(parentId);
    currentId = parentId;
    level++;
  }

  return chain;
}
