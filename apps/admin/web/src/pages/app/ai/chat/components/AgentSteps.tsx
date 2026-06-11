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
    <div style={{ marginBottom: 12 }}>
      {/* Toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          borderRadius: token.borderRadiusSM,
          background: token.colorFillQuaternary,
          border: `1px solid ${token.colorBorderSecondary}`,
          cursor: "pointer",
          marginBottom: expanded ? 8 : 0,
          fontSize: 12,
          color: token.colorTextSecondary,
          userSelect: "none",
        }}
      >
        <RightOutlined
          style={{
            fontSize: 10,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
        {steps.length} 步执行完成
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 8px",
                borderRadius: token.borderRadiusSM,
                fontSize: 12,
                color: token.colorTextSecondary,
              }}
            >
              {/* Status icon */}
              {step.status === "completed" ? (
                <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 13, flexShrink: 0 }} />
              ) : step.status === "error" ? (
                <CloseCircleOutlined style={{ color: token.colorError, fontSize: 13, flexShrink: 0 }} />
              ) : (
                <LoadingOutlined style={{ color: token.colorPrimary, fontSize: 13, flexShrink: 0 }} />
              )}

              {/* Type icon */}
              <StepIcon type={step.type} />

              {/* Name */}
              <Text
                strong={step.type === "skill"}
                style={{
                  fontSize: 12,
                  color: step.type === "skill" ? token.colorPrimary : token.colorText,
                  whiteSpace: "nowrap",
                }}
              >
                {step.name}
              </Text>

              {/* Description */}
              <Text
                type="secondary"
                ellipsis
                style={{ flex: 1, fontSize: 12 }}
              >
                {step.description}
              </Text>

              {/* Duration */}
              <Tag style={{ fontSize: 11, margin: 0, lineHeight: "18px" }}>
                {formatDuration(step.durationMs)}
              </Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
