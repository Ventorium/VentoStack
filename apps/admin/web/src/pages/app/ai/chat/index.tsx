import { RobotOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Space, Spin, Tag, Typography, theme } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "@/api";
import type { AgentItem } from "@/api/types";

const { Text, Paragraph } = Typography;

/** 智能体列表只负责选择；会话状态由独立聊天路由管理。 */
export default function AIChatPage(): React.ReactElement {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client.get("/api/ai/agents", { query: { pageSize: 100, status: "active" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setFailed(true);
        else setAgents((data as { list?: AgentItem[] })?.list ?? []);
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Card title="选择智能体" className="[&_.ant-card-body]:min-h-[400px]">
      {loading ? (
        <div className="p-10 text-center"><Spin size="large" /></div>
      ) : agents.length === 0 ? (
        <Empty description={failed ? "智能体加载失败，请刷新重试" : "暂无可用的智能体，请先在 Agent 管理中创建"}>
          {!failed && <Button type="primary" onClick={() => navigate("/app/ai/agents")}>前往创建</Button>}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map(agent => (
            <button
              key={agent.id}
              type="button"
              onClick={() => navigate(`/app/ai/chat/${agent.id}`)}
              className="w-full cursor-pointer rounded-xl border border-solid p-5 text-left font-inherit transition-colors hover:border-primary focus-visible:outline-primary"
              style={{ borderColor: token.colorBorderSecondary, background: token.colorBgContainer, color: token.colorText }}
            >
              <Space orientation="vertical" className="w-full">
                <Space>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: token.colorPrimaryBg }}>
                    <RobotOutlined className="text-xl" style={{ color: token.colorPrimary }} />
                  </div>
                  <div>
                    <Text strong>{agent.name}</Text>
                    <div><Text type="secondary" className="text-xs">{agent.model?.[0] ?? ""}</Text></div>
                  </div>
                </Space>
                {agent.description && <Paragraph type="secondary" className="mb-0 text-xs" ellipsis={{ rows: 2 }}>{agent.description}</Paragraph>}
                {!!agent.tools?.length && <Tag>{agent.tools.length} 工具</Tag>}
              </Space>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
