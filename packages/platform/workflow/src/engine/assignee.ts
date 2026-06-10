/**
 * @ventostack/workflow — 审批人解析
 *
 * 根据节点配置和运行时上下文，解析出实际的审批人用户 ID 列表。
 * 有副作用：需要查询数据库。
 */

import type { Database } from "@ventostack/database";
import type { GraphNode, EngineContext } from "./graph";
import { workflowErrors } from "./errors";

/** 审批人配置 */
export interface AssigneeConfig {
  mode: "fixed" | "role" | "department" | "lookup" | "form_field";
  userIds?: string[];
  roleId?: string;
  deptId?: string;
  lookupKey?:
    | "initiator_superior"
    | "initiator_dept_leader"
    | "initiator_dept_hr"
    | "last_approver_superior";
  formField?: string;
  validation?: {
    mustHaveRole?: string;
    mustBeInDept?: string;
  };
}

/** 审批节点 config */
export interface ApproveNodeConfig {
  strategy?: "sequential" | "parallel_and" | "parallel_or" | "percentage";
  percentage?: number;
  assignee?: AssigneeConfig;
  formPermission?: { visible: string[]; editable: string[]; required: string[] };
  actionButtons?: string[];
  counterSign?: boolean;
  rejectAction?: "terminate" | "return_to_previous" | "return_to_start";
  onEmptyAssignee?: "error" | "skip" | "escalate";
  timeout?: {
    hours: number;
    action: "remind" | "auto_approve" | "auto_reject" | "escalate";
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

  async function resolve(
    node: GraphNode,
    ctx: EngineContext,
  ): Promise<string[]> {
    const config = node.config as unknown as ApproveNodeConfig | null;
    const assignee = config?.assignee;
    if (!assignee) return [];

    switch (assignee.mode) {
      case "fixed":
        return assignee.userIds ?? [];

      case "role": {
        if (!assignee.roleId) return [];
        const rows = await db
          .raw(
            `SELECT user_id FROM sys_user_role WHERE role_id = $1`,
            [assignee.roleId],
          );
        return rows.map((r: { user_id: string }) => r.user_id);
      }

      case "department": {
        if (!assignee.deptId) return [];
        const rows = await db
          .raw(`SELECT id FROM sys_user WHERE dept_id = $1 AND status = 1`, [
            assignee.deptId,
          ]);
        return rows.map((r: { id: string }) => r.id);
      }

      case "lookup": {
        // 需要解析发起人的上下级关系
        const initiator = await resolveInitiatorDetail(db, ctx.initiator.id);
        switch (assignee.lookupKey) {
          case "initiator_superior":
            return initiator.superiorId ? [initiator.superiorId] : [];
          case "initiator_dept_leader":
            return initiator.deptLeaderId ? [initiator.deptLeaderId] : [];
          case "initiator_dept_hr": {
            // 查找发起人所在部门的 HR 角色用户
            if (!initiator.deptId) return [];
            const hrRows = await db.raw(
              `SELECT ur.user_id FROM sys_user_role ur
               JOIN sys_user u ON u.id = ur.user_id
               JOIN sys_role r ON r.id = ur.role_id
               WHERE u.dept_id = $1 AND r.code = 'hr' AND u.status = 1`,
              [initiator.deptId],
            );
            return hrRows.map((r: { user_id: string }) => r.user_id);
          }
          case "last_approver_superior":
            // TODO: 需要从 history 找到上一审批人，Phase 2 实现
            return [];
          default:
            return [];
        }
      }

      case "form_field": {
        const fieldKey = assignee.formField;
        if (!fieldKey) return [];
        const userId = ctx.formData[fieldKey] as string | undefined;
        if (!userId) return [];

        // 基础校验：用户存在且状态正常
        const user = await db.raw(
          `SELECT id FROM sys_user WHERE id = $1 AND status = 1`,
          [userId],
        );
        if (user.length === 0) throw workflowErrors.invalidAssignee();

        return [userId];
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
    `SELECT id, nickname, dept_id FROM sys_user WHERE id = $1`,
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
    `SELECT r.code FROM sys_role r JOIN sys_user_role ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [userId],
  );
  result.roles = roles.map((r: { code: string }) => r.code);

  // 查找直属上级（通过 dept 的 leader 字段）
  if (u.dept_id) {
    const dept = await db.raw(
      `SELECT leader FROM sys_dept WHERE id = $1`,
      [u.dept_id],
    );
    if (dept.length > 0 && dept[0].leader) {
      result.superiorId = dept[0].leader;
      result.deptLeaderId = dept[0].leader;
    }
  }

  return result;
}
