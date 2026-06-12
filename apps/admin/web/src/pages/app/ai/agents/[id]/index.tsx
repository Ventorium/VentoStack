import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Select, Space, Switch, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, MessageOutlined, RobotOutlined, SaveOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/api";
import type { AgentItem } from "@/api/types";

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
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; value: string }>>([]);

  // 从数据库动态加载模型列表
  useEffect(() => {
    client.get("/api/ai/models").then(({ data }) => {
      const models = data as Array<{ modelId: string; displayName: string | null; providerName: string }> | undefined;
      if (models?.length) {
        setModelOptions(
          models.map((m) => ({
            label: `${m.providerName}/${m.displayName || m.modelId}`,
            value: m.modelId,
          })),
        );
      }
    }).catch(() => {});
  }, []);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { error, data } = await client.get("/api/ai/agents/:id", { params: { id } }) as {
        error?: unknown; data?: AgentItem;
      };
      if (!error && data) {
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
      const { error } = await client.put("/api/ai/agents/:id", { params: { id }, body: values });
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
              options={modelOptions}
              placeholder="选择模型"
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
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
