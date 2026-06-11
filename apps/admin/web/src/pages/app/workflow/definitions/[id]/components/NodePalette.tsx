/** 左侧节点面板 — 支持点击和拖拽 */

import { Card, Typography } from "antd";
import { NODE_TYPE_META, type FlowNodeType } from "./types";

const { Text } = Typography;

interface Props {
  onAddNode: (type: FlowNodeType) => void;
}

const draggableTypes: FlowNodeType[] = ["approve", "cc", "condition"];

export default function NodePalette({ onAddNode }: Props) {
  /** 拖拽开始 — 将 nodeType 存入 dataTransfer */
  const onDragStart = (e: React.DragEvent, nodeType: FlowNodeType) => {
    e.dataTransfer.setData("application/reactflow", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <Card
      title="节点面板"
      size="small"
      style={{ width: 180, borderRadius: 8 }}
      styles={{ body: { padding: 8 } }}
    >
      <div style={{ fontSize: 11, color: "#999", padding: "0 4px 8px" }}>
        拖拽或点击添加到画布
      </div>
      {draggableTypes.map((type) => {
        const meta = NODE_TYPE_META[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            onClick={() => onAddNode(type)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              marginBottom: 4,
              borderRadius: 6,
              border: `1px solid ${meta.color}40`,
              background: `${meta.color}08`,
              cursor: "grab",
              transition: "all 0.2s",
              userSelect: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = `${meta.color}18`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = `${meta.color}08`;
            }}
          >
            <span style={{ fontSize: 16 }}>{meta.icon}</span>
            <Text style={{ fontSize: 13 }}>{meta.label}</Text>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "#999", padding: "12px 4px 4px", borderTop: "1px solid #f0f0f0", marginTop: 8 }}>
        提示：开始和结束节点已自动添加
      </div>
    </Card>
  );
}
