/** AI 链路追踪 — 会话详情：用户/助手消息时间线，助手卡片展开 span 执行链路 */
import { useEffect, useState } from "react";
import { Button, Card, Space, Spin, Typography } from "antd";
import { ArrowLeftOutlined, NodeIndexOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/api";
import type { TraceMessageItem } from "@/api/types";
import MessageTimeline from "../components/MessageTimeline";

const TraceConversationDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<TraceMessageItem[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { error, data } = await client.get("/api/ai/trace/conversations/:id", {
        params: { id },
      });
      if (!alive) return;
      if (!error && data) setMessages(data as TraceMessageItem[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Card
      title={
        <Space>
          <NodeIndexOutlined />
          <span>会话链路时间线</span>
          {id && (
            <Typography.Text code copyable className="text-xs">
              {id}
            </Typography.Text>
          )}
        </Space>
      }
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/trace")}>
          返回列表
        </Button>
      }
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spin tip="加载中" />
        </div>
      ) : (
        <MessageTimeline items={messages} />
      )}
    </Card>
  );
};

export default TraceConversationDetailPage;
