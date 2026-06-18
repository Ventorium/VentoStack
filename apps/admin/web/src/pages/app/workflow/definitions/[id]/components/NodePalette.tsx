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
      className="w-[180px] rounded-lg"
      styles={{ body: { padding: 8 } }}
    >
      <div className="text-[11px] text-[#999]" style={{ padding: "0 4px 8px" }}>
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
            className="flex items-center gap-2 mb-1 rounded-md cursor-grab select-none" style={{ padding: "8px 12px", border: `1px solid ${meta.color}40`, background: `${meta.color}08`, transition: "all 0.2s" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = `${meta.color}18`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = `${meta.color}08`;
            }}
          >
            <span className="text-base">{meta.icon}</span>
            <Text className="text-[13px]">{meta.label}</Text>
          </div>
        );
      })}
      <div className="text-[11px] text-[#999] mt-2" style={{ padding: "12px 4px 4px", borderTop: "1px solid #f0f0f0" }}>
        提示：开始和结束节点已自动添加
      </div>
    </Card>
  );
}
