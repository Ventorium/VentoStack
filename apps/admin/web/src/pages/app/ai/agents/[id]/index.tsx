import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Select, Space, Switch, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, MessageOutlined, RobotOutlined, SaveOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/api";
import type { AgentItem } from "@/api/types";

// AI 接口尚未注册到 OpenAPI schema，临时使用 any
const aiClient = client as any;

const { Title } = Typography;
const { TextArea } = Input;

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  active: { label: "已发布", color: "green" },
  disabled: { label: "已停用", color: "red" },
};

const AgentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await aiClient.get(`/api/ai/agents/${id}`);
      if (!res.error) {
        const data = res.data as AgentItem;
        setAgent(data);
        form.setFieldsValue(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { error } = await aiClient.put(`/api/ai/agents/${id}`, { body: values });
      if (!error) {
        message.success("保存成功");
        fetchData();
      }
    } catch {
      // validation failed
    } finally {
      setSaving(false);
    }
  };

  const s = agent ? statusMap[agent.status] || { label: agent.status, color: "default" } : null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/agents")}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          {agent?.name || "加载中..."}
        </Title>
        {s && <Tag color={s.color}>{s.label}</Tag>}
      </Space>

      <Card loading={loading}>
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="Agent 名称" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="Agent 描述" />
          </Form.Item>

          <Form.Item label="类型" name="type">
            <Select
              options={[
                { label: "聊天机器人", value: "chatbot" },
                { label: "问答助手", value: "qa" },
                { label: "数据查询", value: "data_query" },
              ]}
            />
          </Form.Item>

          <Form.Item label="模型" name="model">
            <Select
              options={[
                { label: "GPT-4o", value: "gpt-4o" },
                { label: "GPT-4o Mini", value: "gpt-4o-mini" },
                { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet" },
              ]}
            />
          </Form.Item>

          <Form.Item label="系统提示词" name="systemPrompt">
            <TextArea rows={6} placeholder="定义 Agent 的行为和能力..." />
          </Form.Item>

          <Form.Item label="公开" name="isPublic" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存
              </Button>
              <Button icon={<MessageOutlined />} onClick={() => navigate("/app/ai/chat")}>
                测试对话
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default AgentDetailPage;
