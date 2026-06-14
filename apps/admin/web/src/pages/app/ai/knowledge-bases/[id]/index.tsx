import KnowledgeBaseBrowser from "../components/KnowledgeBaseBrowser";
import { Card, Space, theme, Button } from "antd";
import { ArrowLeftOutlined, DatabaseOutlined } from "@ant-design/icons";
import { useParams, useNavigate } from "react-router-dom";

export default function KnowledgeBaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined />
          <span>知识库详情</span>
        </Space>
      }
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/knowledge-bases")}>
          返回列表
        </Button>
      }
    >
      <KnowledgeBaseBrowser kbId={id} />
    </Card>
  );
}
