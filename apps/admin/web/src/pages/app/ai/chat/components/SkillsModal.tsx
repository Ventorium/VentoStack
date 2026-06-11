import {
  FolderOutlined,
  HomeOutlined,
  MailOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Col, Divider, Empty, Modal, Row, Space, Switch, Tag, theme, Tooltip, Typography } from "antd";
import { useState } from "react";
import type { Skill, SkillCapability } from "../types";

const { Text, Paragraph } = Typography;

interface SkillsModalProps {
  visible: boolean;
  skills: Skill[];
  onClose?: () => void;
  onToggleCapability?: (skillId: string, capabilityId: string, enabled: boolean) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  terminal: <ToolOutlined />,
  folder: <FolderOutlined />,
  mail: <MailOutlined />,
  music: <PlayCircleOutlined />,
  home: <HomeOutlined />,
};

function getSkillIcon(iconName: string): React.ReactNode {
  return ICON_MAP[iconName] || <ToolOutlined />;
}

export default function SkillsModal({ visible, skills, onClose, onToggleCapability }: SkillsModalProps) {
  const [selectedSkillId, setSelectedSkillId] = useState(skills[0]?.id ?? "");
  const { token } = theme.useToken();

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) ?? skills[0];
  const totalEnabled = skills.reduce((sum, s) => sum + s.enabledCount, 0);
  const totalCapabilities = skills.reduce((sum, s) => sum + s.totalCount, 0);

  return (
    <Modal
      title={
        <Space>
          <span>技能</span>
          <Switch size="small" defaultChecked />
          <Text type="secondary" style={{ fontSize: 12 }}>已启用技能工具</Text>
          <Tag style={{ marginLeft: 8 }}>
            {totalEnabled} / {totalCapabilities}
          </Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={680}
      styles={{
        body: { padding: 0, height: 420, display: "flex", overflow: "hidden" },
      }}
      centered
    >
      {/* Description */}
      <div
        style={{
          padding: "8px 24px",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
          color: token.colorTextSecondary,
          position: "absolute",
          top: 55,
          left: 0,
          right: 0,
          background: token.colorBgElevated,
          zIndex: 1,
        }}
      >
        按需加载的能力包，只在需要时才把技能说明注入上下文，既节约 token，又让助手拥有远超基础模型的扩展能力。
      </div>

      {/* Body: Left + Right split */}
      <div style={{ display: "flex", flex: 1, marginTop: 36 }}>
        {/* Left: Skill List */}
        <div
          style={{
            width: 240,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            overflow: "auto",
            padding: "8px",
            flexShrink: 0,
          }}
        >
          <Text
            type="secondary"
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              padding: "4px 8px 8px",
              display: "block",
            }}
          >
            内置技能
          </Text>
          {skills.map((skill) => {
            const isSelected = skill.id === selectedSkillId;
            return (
              <div
                key={skill.id}
                onClick={() => setSelectedSkillId(skill.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: token.borderRadius,
                  cursor: "pointer",
                  marginBottom: 2,
                  background: isSelected ? token.controlItemBgActive : "transparent",
                  borderLeft: isSelected ? `3px solid ${token.colorPrimary}` : "3px solid transparent",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = token.controlItemBgHover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: token.borderRadiusSM,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: skill.color || token.colorTextSecondary,
                    background: skill.color ? `${skill.color}18` : token.colorFillQuaternary,
                    flexShrink: 0,
                  }}
                >
                  {getSkillIcon(skill.icon)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    strong
                    style={{
                      fontSize: 13,
                      display: "block",
                      color: isSelected ? token.colorPrimary : token.colorText,
                    }}
                    ellipsis
                  >
                    {skill.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                    {skill.description}
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                  {skill.enabledCount}
                </Text>
              </div>
            );
          })}
        </div>

        {/* Right: Capability Details */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {selectedSkill ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
                  {selectedSkill.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {selectedSkill.description}
                </Text>
              </div>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {selectedSkill.capabilities.map((cap) => (
                  <CapabilityRow
                    key={cap.id}
                    capability={cap}
                    skillColor={selectedSkill.color}
                    onToggle={(enabled) => onToggleCapability?.(selectedSkill.id, cap.id, enabled)}
                  />
                ))}
              </Space>
            </>
          ) : (
            <Empty description="请选择技能" style={{ marginTop: 60 }} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function CapabilityRow({
  capability,
  skillColor,
  onToggle,
}: {
  capability: SkillCapability;
  skillColor?: string;
  onToggle?: (enabled: boolean) => void;
}) {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderRadius: token.borderRadius,
        background: token.colorFillQuaternary,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={8} style={{ marginBottom: 4 }}>
          <Text
            strong
            style={{
              fontSize: 13,
              color: capability.enabled ? (skillColor || token.colorPrimary) : token.colorTextSecondary,
            }}
          >
            {capability.name}
          </Text>
          {capability.readonly && (
            <Tag style={{ fontSize: 10, lineHeight: "14px", padding: "0 4px", margin: 0 }}>
              只读
            </Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
          {capability.description}
        </Text>
      </div>
      <Switch
        size="small"
        checked={capability.enabled}
        disabled={capability.readonly}
        onChange={(checked) => onToggle?.(checked)}
        style={{ marginLeft: 16, flexShrink: 0 }}
      />
    </div>
  );
}
