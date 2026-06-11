/** 步骤类型图标 - 使用 Ant Design 图标 */
import {
  CodeOutlined,
  ControlOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import type { AgentStep } from "../types";

interface StepIconProps {
  type: AgentStep["type"];
  style?: React.CSSProperties;
}

export default function StepIcon({ type, style }: StepIconProps) {
  const iconStyle = { fontSize: 13, ...style };

  switch (type) {
    case "thinking":
      return <ThunderboltOutlined style={{ color: "#faad14", ...iconStyle }} />;
    case "skill":
      return <ControlOutlined style={{ color: "#1677ff", ...iconStyle }} />;
    case "bash":
      return <CodeOutlined style={{ color: "#52c41a", ...iconStyle }} />;
    case "tool":
      return <ToolOutlined style={{ color: "#722ed1", ...iconStyle }} />;
    case "error":
      return <ToolOutlined style={{ color: "#ff4d4f", ...iconStyle }} />;
    default:
      return <LoadingOutlined style={iconStyle} />;
  }
}
