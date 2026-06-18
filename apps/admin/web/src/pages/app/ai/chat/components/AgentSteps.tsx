import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, RightOutlined } from "@ant-design/icons";
import { Space, Tag, theme, Typography } from "antd";
import { useState } from "react";
import type { AgentStep } from "../types";
import StepIcon from "./StepIcons";

const { Text } = Typography;

interface AgentStepsProps {
  steps: AgentStep[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AgentSteps({ steps }: AgentStepsProps) {
  const [expanded, setExpanded] = useState(true);
  const { token } = theme.useToken();

  if (!steps.length) return null;

  return (
    <div className="mb-3">
      {/* Toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 cursor-pointer text-xs select-none" style={{ padding: "3px 10px", borderRadius: token.borderRadiusSM, background: token.colorFillQuaternary, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: expanded ? 8 : 0, color: token.colorTextSecondary }}
      >
        <RightOutlined
          className="text-[10px]" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
        />
        {steps.length} 步执行完成
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 py-[4px]" >
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-2 text-xs" style={{ padding: "4px 8px", borderRadius: token.borderRadiusSM, color: token.colorTextSecondary }}
            >
              {/* Status icon */}
              {step.status === "completed" ? (
                <CheckCircleOutlined className="text-[13px] shrink-0" style={{ color: token.colorSuccess }} />
              ) : step.status === "error" ? (
                <CloseCircleOutlined className="text-[13px] shrink-0" style={{ color: token.colorError }} />
              ) : (
                <LoadingOutlined className="text-[13px] shrink-0" style={{ color: token.colorPrimary }} />
              )}

              {/* Type icon */}
              <StepIcon type={step.type} />

              {/* Name */}
              <Text
                strong={step.type === "skill"}
                className="text-xs whitespace-nowrap" style={{ color: step.type === "skill" ? token.colorPrimary : token.colorText }}
              >
                {step.name}
              </Text>

              {/* Description */}
              <Text
                type="secondary"
                ellipsis
                className="flex-1 text-xs"
              >
                {step.description}
              </Text>

              {/* Duration */}
              <Tag className="text-[11px] m-0 leading-[18px]" >
                {formatDuration(step.durationMs)}
              </Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
