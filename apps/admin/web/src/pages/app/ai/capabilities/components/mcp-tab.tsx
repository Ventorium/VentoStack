/**
 * AI 智能能力管理 — MCP 服务
 */
import { client } from "@/api";
import type { McpServerItem, PaginatedData } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  FunctionOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Collapse,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/utils/fmtDate";

const { Text } = Typography;
const { TextArea } = Input;

export default function McpTab() {
  const { token } = theme.useToken();
  const [data, setData] = useState<McpServerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<McpServerItem | null>(null);
  const [form] = Form.useForm();
  const [testing, setTesting] = useState<string | null>(null);
  const [toolsDrawer, setToolsDrawer] = useState<McpServerItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data: result } = (await client.get("/api/ai/mcp-servers", {
        query: { page, pageSize: 20 },
      })) as { error?: unknown; data?: PaginatedData<McpServerItem> };
      if (!error && result) {
        setData(result.list);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { refresh(); }, [refresh]);

  // 粘贴内容自动解析
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain").trim();
    if (!text) return;

    let parsed = false;

    // 尝试解析 JSON 格式
    if (text.startsWith("{")) {
      try {
        const json = JSON.parse(text);
        if (json.command || json.url) {
          const updates: Record<string, unknown> = {};
          if (json.command) {
            updates.transportType = "stdio";
            updates.command = json.command;
            if (json.args) updates.argsStr = (json.args as string[]).join("\n");
            if (json.env && typeof json.env === "object") {
              updates.envStr = Object.entries(json.env).map(([k, v]) => `${k}=${v}`).join("\n");
            }
          }
          if (json.url) {
            updates.transportType = "sse";
            updates.url = json.url;
            if (json.headers && typeof json.headers === "object") {
              updates.headersStr = JSON.stringify(json.headers, null, 2);
            }
          }
          if (!json.name && json.command) {
            // 自动提取名称：取命令的第二个参数（通常是包名）
            const parts = [json.command, ...(json.args ?? [])];
            const pkg = parts.find((p: string) => p.startsWith("@") || (!p.startsWith("-") && p !== json.command));
            if (pkg) updates.name = pkg.replace(/^@[^/]+\//, "").replace(/-mcp$/, "").replace(/^server-/, "");
          }
          form.setFieldsValue(updates);
          parsed = true;
        }
      } catch {}
    }

    // 尝试解析命令行格式：VAR=val VAR2=val2 command args...
    if (!parsed) {
      const envVars: Record<string, string> = {};
      let rest = text;

      // 提取开头的 KEY=VALUE 对
      const envParts: string[] = [];
      const segments = rest.split(/\s+/);
      for (const seg of segments) {
        const eqIdx = seg.indexOf("=");
        if (eqIdx > 0 && /^[A-Z_a-z][A-Za-z0-9_]*$/.test(seg.slice(0, eqIdx))) {
          const val = seg.slice(eqIdx + 1);
          // 值不包含空格或者是引号包围的
          if (!val.includes(" ") || val.startsWith('"') || val.startsWith("'")) {
            envParts.push(seg);
            continue;
          }
        }
        break;
      }

      if (envParts.length > 0) {
        for (const part of envParts) {
          const eqIdx = part.indexOf("=");
          const key = part.slice(0, eqIdx);
          let val = part.slice(eqIdx + 1);
          // 去掉引号
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          envVars[key] = val;
        }
        rest = text.slice(text.indexOf(envParts[envParts.length - 1]) + envParts[envParts.length - 1].length).trim();
      }

      // 剩余部分是 command + args
      const cmdParts = rest.split(/\s+/).filter(Boolean);
      if (cmdParts.length > 0) {
        const updates: Record<string, unknown> = {
          transportType: "stdio",
          command: cmdParts[0],
        };
        if (cmdParts.length > 1) updates.argsStr = cmdParts.slice(1).join("\n");
        if (Object.keys(envVars).length > 0) {
          updates.envStr = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n");
        }
        // 自动提取名称
        const pkg = cmdParts.find((p: string) => p.startsWith("@") || (!p.startsWith("-") && p !== cmdParts[0]));
        if (pkg) updates.name = pkg.replace(/^@[^/]+\//, "").replace(/-mcp$/, "").replace(/^server-/, "");
        form.setFieldsValue(updates);
        parsed = true;
      }
    }

    if (parsed) {
      msg.success("已自动解析并填充表单");
    }
  }, [form]);

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const body: Record<string, unknown> = {
      name: values.name,
      description: values.description,
      transportType: values.transportType,
    };

    if (values.transportType === "stdio") {
      body.command = values.command;
      if (values.argsStr) body.args = values.argsStr.split("\n").map((s: string) => s.trim()).filter(Boolean);
      if (values.envStr) {
        try {
          body.env = Object.fromEntries(
            values.envStr.split("\n").filter(Boolean).map((line: string) => {
              const [k, ...v] = line.split("=");
              return [k.trim(), v.join("=").trim()];
            })
          );
        } catch { /* ignore */ }
      }
    } else {
      body.url = values.url;
      if (values.headersStr) {
        try { body.headers = JSON.parse(values.headersStr); } catch { /* ignore */ }
      }
    }

    if (editItem) {
      const { error } = (await client.put("/api/ai/mcp-servers/:id", { params: { id: editItem.id }, body })) as { error?: unknown };
      if (!error) { msg.success("更新成功"); setEditOpen(false); refresh(); }
    } else {
      const { error } = (await client.post("/api/ai/mcp-servers", { body })) as { error?: unknown };
      if (!error) { msg.success("创建成功"); setEditOpen(false); refresh(); }
    }
  }, [form, editItem, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = (await client.delete("/api/ai/mcp-servers/:id", { params: { id } })) as { error?: unknown };
    if (!error) { msg.success("已删除"); refresh(); }
  }, [refresh]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const { error, data: result } = (await client.post("/api/ai/mcp-servers/:id/test", { params: { id } })) as {
        error?: unknown; data?: { success: boolean; tools?: Array<{ name: string; description: string }>; error?: string }
      };
      if (!error && result) {
        if (result.success) {
          msg.success(`连接成功! 发现 ${result.tools?.length ?? 0} 个工具`);
        } else {
          msg.error(`连接失败: ${result.error}`);
        }
        refresh();
      }
    } finally {
      setTesting(null);
    }
  }, [refresh]);

  const openEdit = (item?: McpServerItem) => {
    setEditItem(item ?? null);
    if (item) {
      form.setFieldsValue({
        name: item.name,
        description: item.description,
        transportType: item.transportType,
        command: item.command,
        argsStr: (item.args ?? []).join("\n"),
        envStr: item.env ? Object.entries(item.env).map(([k, v]) => `${k}=${v}`).join("\n") : "",
        url: item.url,
        headersStr: item.headers ? JSON.stringify(item.headers, null, 2) : "",
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ transportType: "stdio" });
    }
    setEditOpen(true);
  };

  const columns: ColumnsType<McpServerItem> = [
    {
      title: "名称", dataIndex: "name", width: 180,
      render: (v: string, r: McpServerItem) => (
        <Space>
          <ApiOutlined style={{ color: r.enabled ? "#1677ff" : "#d9d9d9" }} />
          <div>
            <div className="font-medium">{v}</div>
            {r.description && <Text type="secondary" className="text-xs">{r.description}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: "传输", dataIndex: "transportType", width: 80,
      render: (v: string) => <Tag color={v === "stdio" ? "green" : "blue"}>{v}</Tag>,
    },
    {
      title: "地址", width: 260,
      render: (_: unknown, r: McpServerItem) => (
        <Text ellipsis className="text-xs max-w-[240px]">
          {r.transportType === "stdio" ? `${r.command} ${(r.args ?? []).join(" ")}` : r.url}
        </Text>
      ),
    },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: (v: string, r: McpServerItem) => {
        const map: Record<string, { color: string; label: string }> = {
          connected: { color: "green", label: "已连接" },
          error: { color: "red", label: "错误" },
          pending: { color: "default", label: "待测试" },
        };
        const s = map[v] ?? map.pending;
        return (
          <Tooltip title={r.lastError}>
            <Tag color={s.color}>{s.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "工具数", dataIndex: "toolCount", width: 70,
      render: (v: number, r: McpServerItem) => (
        v > 0
          ? <Button type="link" size="small" onClick={() => setToolsDrawer(r)}>{v}</Button>
          : <Text type="secondary">0</Text>
      ),
    },
    {
      title: "启用", dataIndex: "enabled", width: 60,
      render: (v: boolean, r: McpServerItem) => (
        <Switch
          size="small"
          checked={v}
          onChange={async (checked) => {
            await client.put("/api/ai/mcp-servers/:id/enabled", { params: { id: r.id }, body: { enabled: checked } });
            refresh();
          }}
        />
      ),
    },
    { title: "创建时间", dataIndex: "createdAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    { title: "更新时间", dataIndex: "updatedAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    {
      title: "操作", width: 180, fixed: "right",
      render: (_: unknown, r: McpServerItem) => (
        <Space size={4}>
          <Tooltip title="测试连接"><Button size="small" icon={<ThunderboltOutlined />} loading={testing === r.id} onClick={() => handleTest(r.id)} /></Tooltip>
          <Tooltip title="编辑"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const transportType = Form.useWatch("transportType", form);

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <Text type="secondary">MCP (Model Context Protocol) 标准的服务端连接管理。支持 stdio（本地进程）和 SSE（远程 HTTP）两种传输方式。</Text>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>添加 MCP 服务</Button>
          <Button icon={<ReloadOutlined />} onClick={refresh} />
        </Space>
      </div>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: setPage }} size="small" scroll={{ x: 1000 }} />

      {/* 编辑 Modal */}
      <Modal
        title={editItem ? "编辑 MCP 服务" : "添加 MCP 服务"}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ transportType: "stdio" }}>
          {!editItem && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: token.colorBgTextHover, border: `1px dashed ${token.colorBorder}` }}>
              <Text type="secondary" className="text-xs block mb-2">
                📋 粘贴 MCP 配置自动填充（支持 JSON 配置 或 命令行格式）
              </Text>
              <Input.TextArea
                rows={2}
                placeholder={'粘贴 JSON 配置或命令行，如：\n{"command":"npx","args":["-y","firecrawl-mcp"],"env":{"API_KEY":"xxx"}}\n或\nAPI_KEY=xxx npx -y firecrawl-mcp'}
                onPaste={handlePaste}
                className="text-xs"
              />
            </div>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如 filesystem, github, database" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <TextArea rows={2} placeholder="这个 MCP 服务提供什么能力" />
          </Form.Item>
          <Form.Item name="transportType" label="传输方式" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="stdio">stdio (本地进程)</Radio.Button>
              <Radio.Button value="sse">SSE (远程 HTTP)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {transportType === "stdio" ? (
            <>
              <Form.Item name="command" label="命令" rules={[{ required: true }]} extra="如 npx, node, python3, 或绝对路径">
                <Input placeholder="npx" />
              </Form.Item>
              <Form.Item name="argsStr" label="参数（每行一个）" extra="如 -y @modelcontextprotocol/server-filesystem /path/to/dir">
                <TextArea rows={3} placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"} />
              </Form.Item>
              <Form.Item name="envStr" label="环境变量（KEY=VALUE 每行一个）">
                <TextArea rows={2} placeholder={"API_KEY=sk-xxx\nDEBUG=true"} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="url" label="服务 URL" rules={[{ required: true }]}>
                <Input placeholder="http://localhost:3001/sse" />
              </Form.Item>
              <Form.Item name="headersStr" label="请求头（JSON 格式）">
                <TextArea rows={2} placeholder={'{"Authorization": "Bearer xxx"}'} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* 工具列表抽屉 */}
      <Drawer
        title={`${toolsDrawer?.name ?? ""} — 工具列表`}
        open={!!toolsDrawer}
        onClose={() => setToolsDrawer(null)}
        size="default"
      >
        {(toolsDrawer?.toolsSnapshot ?? []).length === 0 ? (
          <Empty description="暂无工具数据，请先测试连接" />
        ) : (
          <div>
            {(toolsDrawer?.toolsSnapshot ?? []).map((tool: { name: string; description: string; inputSchema?: Record<string, unknown> }) => (
              <div key={tool.name} style={{ padding: "12px 0", borderBottom: "1px solid " + token.colorBorderSecondary }}>
                <Space align="start">
                  <FunctionOutlined className="text-lg text-[#1677ff] mt-0.5" />
                  <div>
                    <Text strong>{tool.name}</Text>
                    <div><Text className="text-[13px]">{tool.description}</Text></div>
                    {tool.inputSchema && (
                      <Collapse size="small" ghost className="mt-1">
                        <Collapse.Panel key="schema" header={<Text type="secondary" className="text-[11px]">参数 Schema</Text>}>
                          <pre className="text-[11px] m-0">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                        </Collapse.Panel>
                      </Collapse>
                    )}
                  </div>
                </Space>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────
// 工具 (Tools) Tab
// ─────────────────────────────────────────