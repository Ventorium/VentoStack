/** 自定义节点组件 — 加大 Handle 可操作区域 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_META, type FlowNodeData } from "./types";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  border: "2px solid #fff",
  boxShadow: "0 0 4px rgba(0,0,0,0.2)",
};

const nodeBaseStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "2px solid",
  minWidth: 120,
  textAlign: "center",
  fontSize: 13,
  background: "#fff",
  cursor: "move",
};

function StartEndNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[d.nodeType];
  const isStart = d.nodeType === "start";
  return (
    <div style={{
      ...nodeBaseStyle,
      borderColor: selected ? "#000" : meta.color,
      borderRadius: isStart ? 24 : 8,
      background: selected ? `${meta.color}10` : "#fff",
    }}>
      <span style={{ marginRight: 4 }}>{meta.icon}</span>
      {d.label}
      {isStart && <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: meta.color }} />}
      {!isStart && <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: meta.color }} />}
    </div>
  );
}

function ApproveNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[d.nodeType];
  const strategy = d.config?.strategy ?? "sequential";
  const strategyLabel: Record<string, string> = {
    sequential: "依次审批", parallel_and: "会签(全部)", parallel_or: "或签(任一)",
    percentage: `百分比(${d.config?.percentage ?? 50}%)`,
  };
  const assignee = d.config?.assignee;
  const assigneeLabel = assignee?.mode === "fixed" ? `${assignee.userIds?.length ?? 0}人` : assignee?.mode === "role" ? "按角色" : assignee?.mode === "department" ? "按部门" : assignee?.mode === "tag" ? "按标签" : assignee?.mode === "dept_tag" ? "部门+标签" : assignee?.mode === "lookup" ? "自动查找" : "未配置";
  return (
    <div style={{
      ...nodeBaseStyle, minWidth: 140,
      borderColor: selected ? "#000" : meta.color,
      background: selected ? `${meta.color}10` : "#fff",
    }}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: meta.color }} />
      <div style={{ fontWeight: 600 }}><span style={{ marginRight: 4 }}>{meta.icon}</span>{d.label}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{strategyLabel[strategy]} · {assigneeLabel}</div>
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: meta.color }} />
    </div>
  );
}

function CcNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[d.nodeType];
  const assignee = d.config?.assignee;
  const assigneeLabel = assignee?.mode === "fixed" ? `${assignee.userIds?.length ?? 0}人` : assignee?.mode === "role" ? "按角色" : "未配置";
  return (
    <div style={{
      ...nodeBaseStyle,
      borderColor: selected ? "#000" : meta.color,
      background: selected ? `${meta.color}10` : "#fff",
    }}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: meta.color }} />
      <div style={{ fontWeight: 600 }}><span style={{ marginRight: 4 }}>{meta.icon}</span>{d.label}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{assigneeLabel}</div>
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: meta.color }} />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[d.nodeType];
  const condCount = d.config?.conditions?.length ?? 0;
  return (
    <div style={{
      ...nodeBaseStyle, minWidth: 100,
      borderColor: selected ? "#000" : meta.color,
      background: selected ? `${meta.color}10` : "#fff",
      borderRadius: 4,
    }}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: meta.color }} />
      <div style={{ fontWeight: 600 }}><span style={{ marginRight: 4 }}>{meta.icon}</span>{d.label}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
        {condCount > 0 ? `${condCount} 个条件` : "未配置条件"}
      </div>
      <Handle type="source" position={Position.Bottom} id="default" style={{ ...handleStyle, background: meta.color }} />
      <Handle type="source" position={Position.Right} id="condition" style={{ ...handleStyle, background: meta.color, top: "50%" }} />
    </div>
  );
}

export const customNodeTypes = {
  start: memo(StartEndNode),
  end: memo(StartEndNode),
  approve: memo(ApproveNode),
  cc: memo(CcNode),
  condition: memo(ConditionNode),
};
