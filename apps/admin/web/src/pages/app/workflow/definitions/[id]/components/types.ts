/** 工作流设计器共享类型 */

export type FlowNodeType = "start" | "end" | "approve" | "cc" | "condition";

export interface ConditionItem {
  field: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in";
  value: string;
  targetNodeId: string;
}

export interface NodeConfig {
  strategy?: "sequential" | "parallel_and" | "parallel_or" | "percentage";
  percentage?: number;
  assignee?: {
    mode: "fixed" | "role" | "department" | "lookup" | "form_field" | "dept_tag";
    userIds?: string[];
    roleId?: string;
    deptId?: string;
    lookupKey?: string;
    formField?: string;
    tagId?: string;
    tagCode?: string;
    /** dept_tag 模式: 标签标识列表 */
    tagCodes?: string[];
    /** dept_tag 模式: 匹配模式 */
    tagMatchMode?: "and" | "or";
    /** dept_tag 模式: 是否向上遍历父部门 */
    deptTraversal?: boolean;
    /** dept_tag 模式: 最大遍历层级，0=不限 */
    traversalLevels?: number;
  };
  rejectAction?: "terminate" | "return_to_previous" | "return_to_start";
  counterSign?: boolean;
  conditions?: ConditionItem[];
  defaultNodeId?: string;
}

export interface FlowNodeData {
  label: string;
  nodeType: FlowNodeType;
  config: NodeConfig | null;
}

export const NODE_TYPE_META: Record<FlowNodeType, { label: string; color: string; icon: string }> = {
  start: { label: "开始", color: "#52c41a", icon: "▶" },
  end: { label: "结束", color: "#ff4d4f", icon: "■" },
  approve: { label: "审批", color: "#1677ff", icon: "✓" },
  cc: { label: "抄送", color: "#722ed1", icon: "✉" },
  condition: { label: "条件", color: "#fa8c16", icon: "◇" },
};
