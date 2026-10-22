/**
 * 连接器 Tab：平台预设服务目录 + 个人连接管理
 *
 * - 目录卡片墙按分类分组，展示绑定状态徽标
 * - oauth2 类走 popup 授权（postMessage 回传 + 轮询绑定状态）
 * - api_key / personal_token / custom_fields 类走字段表单
 */
import { client } from "@/api";
import type { ConnectorCatalogItem, ConnectorBindingItem, ConnectorAuthTemplate } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import {
  ApiOutlined,
  CheckCircleFilled,
  DisconnectOutlined,
  LinkOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

const { Text, Paragraph } = Typography;

const CATEGORY_LABELS: Record<string, string> = {
  office: "办公协同",
  knowledge: "知识库",
  productivity: "效率工具",
  dev: "开发",
  search: "搜索",
  media: "媒体",
};

function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c;
}

function statusTag(status: string | null) {
  if (!status) return <Tag>未连接</Tag>;
  const map: Record<string, { color: string; label: string }> = {
    connected: { color: "success", label: "已连接" },
    pending: { color: "processing", label: "连接中" },
    expired: { color: "warning", label: "已过期" },
    revoked: { color: "default", label: "已解绑" },
    error: { color: "error", label: "连接失败" },
  };
  const s = map[status] ?? { color: "default", label: status };
  return <Tag color={s.color}>{s.label}</Tag>;
}

/** 打开 popup 授权窗口，并监听 postMessage 回传 */
function openOAuthPopup(redirectUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const w = window.open(redirectUrl, "connector-oauth", "width=600,height=700");
    if (!w) {
      msg.error("浏览器拦截了授权窗口，请允许弹出窗口");
      resolve();
      return;
    }
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; status?: string; displayName?: string } | null;
      if (data?.type === "connector-oauth") {
        window.removeEventListener("message", handler);
        if (data.status === "connected") msg.success(`已连接 ${data.displayName ?? ""}`);
        else msg.warning("授权未完成");
        w.close();
        resolve();
      }
    };
    window.addEventListener("message", handler);
    // 兜底：轮询窗口关闭
    const timer = setInterval(() => {
      if (w.closed) {
        clearInterval(timer);
        window.removeEventListener("message", handler);
        resolve();
      }
    }, 500);
  });
}

export default function ConnectorsTab() {
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [bindings, setBindings] = useState<ConnectorBindingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [credModal, setCredModal] = useState<ConnectorCatalogItem | null>(null);
  const [credSubmitting, setCredSubmitting] = useState(false);
  const [oauthOpening, setOauthOpening] = useState<string | null>(null);
  const [form] = Form.useForm();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, bindRes] = await Promise.all([
        client.get("/api/ai/connectors/catalog"),
        client.get("/api/ai/connectors/bindings"),
      ]);
      if (!catRes.error && catRes.data) setCatalog(catRes.data as ConnectorCatalogItem[]);
      if (!bindRes.error && bindRes.data) setBindings(bindRes.data as ConnectorBindingItem[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  /** OAuth popup 完成后短暂轮询绑定状态 */
  const schedulePoll = useCallback(() => {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      await refresh();
      if (attempts < 4) pollTimer.current = setTimeout(poll, 1500);
    };
    pollTimer.current = setTimeout(poll, 1000);
  }, [refresh]);

  const handleOAuthConnect = async (item: ConnectorCatalogItem) => {
    setOauthOpening(item.kind);
    try {
      const { error, data } = (await client.post("/api/ai/connectors/:kind/connect", {
        params: { kind: item.kind },
      })) as { error?: unknown; data?: { redirectUrl: string } };
      if (error || !data?.redirectUrl) {
        msg.error("发起授权失败");
        return;
      }
      await openOAuthPopup(data.redirectUrl);
      schedulePoll();
    } finally {
      setOauthOpening(null);
    }
  };

  const openCredModal = (item: ConnectorCatalogItem) => {
    setCredModal(item);
    form.resetFields();
  };

  const handleCredSubmit = async () => {
    if (!credModal) return;
    const values = (await form.validateFields()) as Record<string, string>;
    setCredSubmitting(true);
    try {
      const { error } = await client.post("/api/ai/connectors/:kind/credentials", {
        params: { kind: credModal.kind },
        body: { values },
      });
      if (!error) {
        msg.success(`已连接 ${credModal.name}`);
        setCredModal(null);
        await refresh();
      }
    } finally {
      setCredSubmitting(false);
    }
  };

  const handleDisconnect = async (binding: ConnectorBindingItem) => {
    const { error } = await client.delete("/api/ai/connectors/bindings/:id", {
      params: { id: binding.id },
    });
    if (!error) {
      msg.success("已解绑");
      await refresh();
    }
  };

  const renderAuthFields = (tpl: ConnectorAuthTemplate | null) => {
    const fields = tpl?.fields ?? [];
    return fields.map((f) => (
      <Form.Item
        key={f.key}
        name={f.key}
        label={f.label}
        rules={[{ required: true, message: `请输入 ${f.label}` }]}
        tooltip={f.help}
      >
        <Input.Password placeholder={f.placeholder ?? `请输入 ${f.label}`} visibilityToggle={!!f.secret} />
      </Form.Item>
    ));
  };

  // 按分类分组
  const grouped = new Map<string, ConnectorCatalogItem[]>();
  for (const item of catalog) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  if (loading && catalog.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <Space className="mb-3 w-full justify-between">
        <Text type="secondary">
          连接器让你无需手动配置 MCP，授权后即可在对话中使用第三方服务的能力。
        </Text>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          刷新
        </Button>
      </Space>

      {[...grouped.entries()].map(([category, items]) => (
        <div key={category} className="mb-5">
          <Text strong className="mb-2 block">
            {categoryLabel(category)}
          </Text>
          <Row gutter={[16, 16]}>
            {items.map((item) => {
              const binding = bindings.find((b) => b.connectorKind === item.kind && b.scope === "user");
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={item.id}>
                  <Card
                    size="small"
                    actions={[
                      item.authType === "oauth2" ? (
                        <Button
                          key="oauth"
                          type="link"
                          size="small"
                          icon={<LinkOutlined />}
                          loading={oauthOpening === item.kind}
                          onClick={() => handleOAuthConnect(item)}
                        >
                          {binding?.status === "connected" ? "重新授权" : "连接"}
                        </Button>
                      ) : (
                        <Button
                          key="cred"
                          type="link"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => openCredModal(item)}
                        >
                          {binding?.status === "connected" ? "重新连接" : "连接"}
                        </Button>
                      ),
                      binding && binding.status !== "revoked" ? (
                        <Popconfirm
                          key="disconnect"
                          title="确定解绑该连接器？"
                          onConfirm={() => handleDisconnect(binding)}
                        >
                          <Button type="link" size="small" danger icon={<DisconnectOutlined />}>
                            解绑
                          </Button>
                        </Popconfirm>
                      ) : null,
                    ].filter(Boolean)}
                  >
                    <Card.Meta
                      avatar={
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-blue-50 text-blue-500">
                          <ApiOutlined className="text-xl" />
                        </div>
                      }
                      title={
                        <Space size={4}>
                          <span>{item.name}</span>
                          {item.bindingStatus === "connected" && (
                            <Tooltip title="当前账号已连接">
                              <CheckCircleFilled className="text-green-500" />
                            </Tooltip>
                          )}
                        </Space>
                      }
                      description={
                        <>
                          <Paragraph type="secondary" ellipsis={{ rows: 2 }} className="!mb-1 text-xs">
                            {item.description ?? ""}
                          </Paragraph>
                          <Space size={4}>
                            {statusTag(item.bindingStatus)}
                            {binding?.accountHint && <Tag>{binding.accountHint}</Tag>}
                          </Space>
                        </>
                      }
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      ))}

      {/* API Key / personal_token 类连接表单 */}
      <Modal
        title={`连接 ${credModal?.name ?? ""}`}
        open={!!credModal}
        onCancel={() => setCredModal(null)}
        onOk={handleCredSubmit}
        confirmLoading={credSubmitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {renderAuthFields(credModal?.authTemplate ?? null)}
        </Form>
      </Modal>
    </div>
  );
}
