/**
 * 虚拟机接入 Tab
 *
 * 平台管理员维护全局宿主池：新增 → 复制安装命令 → 回填连接地址验证 → 在线监控。
 * 普通用户看不到该 Tab（由 availability.canManageHosts 控制）。
 */
import { client } from '@/api';
import type {
  RuntimeAvailability,
  RuntimeHostCreateResult,
  RuntimeHostItem,
  RuntimeInstanceItem,
  RuntimePreflight,
} from '@/api/types';
import { msg } from '@/components/GlobalMessage';
import { fmtDate } from '@/utils/fmtDate';
import {
  CloudServerOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

const { Text, Paragraph } = Typography;

type RuntimeClient = {
  get(path: string, options?: unknown): Promise<{ data?: unknown; error?: unknown }>;
  post(path: string, options?: unknown): Promise<{ data?: unknown; error?: unknown }>;
  put(path: string, options?: unknown): Promise<{ data?: unknown; error?: unknown }>;
  delete(path: string, options?: unknown): Promise<{ data?: unknown; error?: unknown }>;
};

const runtimeClient = client as unknown as RuntimeClient;

const STATUS_META: Record<
  RuntimeHostItem['status'],
  { color: string; label: string }
> = {
  pending: { color: 'default', label: '待接入' },
  online: { color: 'success', label: '在线' },
  offline: { color: 'error', label: '离线' },
  unauthorized: { color: 'warning', label: '鉴权失败' },
  incompatible: { color: 'warning', label: '版本不兼容' },
  disabled: { color: 'default', label: '已停用' },
};

function statusTag(status: RuntimeHostItem['status']) {
  const meta = STATUS_META[status] ?? { color: 'default', label: status };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function usagePercent(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

export default function RuntimeTab() {
  const [hosts, setHosts] = useState<RuntimeHostItem[]>([]);
  const [availability, setAvailability] = useState<RuntimeAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [myInstances, setMyInstances] = useState<RuntimeInstanceItem[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<RuntimeHostCreateResult | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const [preflight, setPreflight] = useState<RuntimePreflight | null>(null);
  const [precheckAck, setPrecheckAck] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<RuntimeHostItem | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [instancesOpen, setInstancesOpen] = useState(false);
  const [instances, setInstances] = useState<RuntimeInstanceItem[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instanceHost, setInstanceHost] = useState<RuntimeHostItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [hostsRes, availabilityRes] = await Promise.all([
        runtimeClient.get('/api/ai/runtime-hosts'),
        runtimeClient.get('/api/ai/runtime/availability'),
      ]);
      if (hostsRes.error) {
        const status = (hostsRes.error as { status?: number } | undefined)?.status;
        if (status === 403 || status === 401) setForbidden(true);
        setHosts([]);
      } else {
        setHosts((hostsRes.data as RuntimeHostItem[]) ?? []);
        setForbidden(false);
      }
      if (!availabilityRes.error && availabilityRes.data) {
        setAvailability(availabilityRes.data as RuntimeAvailability);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyInstances = useCallback(async () => {
    setMyLoading(true);
    try {
      const { data } = await runtimeClient.get('/api/ai/runtime/instances');
      setMyInstances((data as RuntimeInstanceItem[]) ?? []);
    } finally {
      setMyLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (forbidden) void loadMyInstances();
  }, [forbidden, loadMyInstances]);

  const handleOpenCreate = async () => {
    setPrecheckAck(false);
    setPreflight(null);
    setCreateOpen(true);
    setPreflightLoading(true);
    try {
      const { data, error } = await runtimeClient.get('/api/ai/runtime-hosts/preflight');
      if (error) {
        msg.error((error as { message?: string } | undefined)?.message ?? '获取预检要求失败');
        return;
      }
      setPreflight(data as RuntimePreflight);
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!precheckAck) {
      msg.warning('请先在目标宿主机执行预检，并确认全部 PASS');
      return;
    }
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const { error, data } = await runtimeClient.post('/api/ai/runtime-hosts', {
        body: {
          name: values.name,
          note: values.note,
          listenAddress: values.listenAddress,
          ...(values.cpuTotal ? { cpuTotal: values.cpuTotal } : {}),
          ...(values.memoryMbTotal ? { memoryMbTotal: values.memoryMbTotal } : {}),
          ...(values.diskMbTotal ? { diskMbTotal: values.diskMbTotal } : {}),
          ...(values.maxSandboxes ? { maxSandboxes: values.maxSandboxes } : {}),
        },
      });
      if (error) {
        msg.error((error as { message?: string } | undefined)?.message ?? '新增宿主失败');
        return;
      }
      const result = data as RuntimeHostCreateResult;
      setCreated(result);
      const host = result.item;
      const guessed = host.listenAddress
        ? `http://${host.listenAddress.replace(/^0\.0\.0\.0/, '127.0.0.1')}`
        : '';
      setBaseUrl(guessed);
      refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async () => {
    if (!created) return;
    if (!baseUrl.trim()) {
      msg.warning('请填写后端可访问的宿主地址');
      return;
    }
    setVerifying(true);
    try {
      const { error, data } = await runtimeClient.post('/api/ai/runtime-hosts/:id/verify', {
        params: { id: created.item.id },
        body: { baseUrl: baseUrl.trim() },
      });
      if (error) {
        msg.error((error as { message?: string } | undefined)?.message ?? '连接验证失败');
        return;
      }
      const item = data as RuntimeHostItem;
      if (item.status === 'online') {
        msg.success('虚拟机宿主已接入');
        setCreateOpen(false);
        setCreated(null);
        createForm.resetFields();
        refresh();
      } else {
        msg.warning(item.lastError ?? `宿主状态：${item.status}`);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleEdit = (record: RuntimeHostItem) => {
    setEditItem(record);
    editForm.setFieldsValue({
      name: record.name,
      note: record.note,
      enabled: record.enabled,
      cpuTotal: record.cpuTotal,
      memoryMbTotal: record.memoryMbTotal,
      diskMbTotal: record.diskMbTotal,
      maxSandboxes: record.maxSandboxes,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      const { error } = await runtimeClient.put('/api/ai/runtime-hosts/:id', {
        params: { id: editItem.id },
        body: values,
      });
      if (error) {
        msg.error((error as { message?: string } | undefined)?.message ?? '保存失败');
        return;
      }
      msg.success('已保存');
      setEditOpen(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: RuntimeHostItem, force = false) => {
    const { error } = await runtimeClient.delete('/api/ai/runtime-hosts/:id', {
      params: { id: record.id },
      query: force ? { force: 'true' } : {},
    });
    if (error) {
      const status = (error as { status?: number } | undefined)?.status;
      const message = (error as { message?: string } | undefined)?.message ?? '删除失败';
      if (status === 409 && !force) {
        Modal.confirm({
          title: '宿主上仍有虚拟机实例',
          content: `${message}。强制删除会销毁这些实例（不可恢复，工作区会先尝试备份）。`,
          okText: '强制删除',
          okButtonProps: { danger: true },
          onOk: () => handleDelete(record, true),
        });
      } else {
        msg.error(message);
      }
      return;
    }
    msg.success('已删除宿主');
    refresh();
  };

  const handleRotate = (record: RuntimeHostItem) => {
    Modal.confirm({
      title: '轮换宿主 Token',
      content: '轮换后需要把新命令在宿主机上重新执行，旧 Token 会失效。',
      onOk: async () => {
        const { error, data } = await runtimeClient.post(
          '/api/ai/runtime-hosts/:id/rotate-token',
          { params: { id: record.id } },
        );
        if (error) {
          msg.error((error as { message?: string } | undefined)?.message ?? '轮换失败');
          return;
        }
        const result = data as RuntimeHostCreateResult;
        Modal.info({
          title: '新的安装命令',
          width: 720,
          content: (
            <Paragraph copyable={{ text: result.installCommand }} className="mt-3">
              <pre className="whitespace-pre-wrap break-all text-xs">{result.installCommand}</pre>
            </Paragraph>
          ),
        });
        refresh();
      },
    });
  };

  const openInstances = async (record: RuntimeHostItem) => {
    setInstanceHost(record);
    setInstancesOpen(true);
    setInstancesLoading(true);
    try {
      const { data } = await runtimeClient.get('/api/ai/runtime-hosts/:id/instances', {
        params: { id: record.id },
      });
      setInstances((data as RuntimeInstanceItem[]) ?? []);
    } finally {
      setInstancesLoading(false);
    }
  };

  const instanceAction = async (
    instance: RuntimeInstanceItem,
    action: 'pause' | 'resume' | 'destroy',
  ) => {
    const endpoint =
      action === 'pause'
        ? '/api/ai/runtime/instances/:id/pause'
        : action === 'resume'
          ? '/api/ai/runtime/instances/:id/resume'
          : '/api/ai/runtime/instances/:id/destroy';
    const { error } = await runtimeClient.post(endpoint, {
      params: { id: instance.id },
    });
    if (error) {
      msg.error((error as { message?: string } | undefined)?.message ?? '操作失败');
      return;
    }
    msg.success('操作成功');
    if (instanceHost) await openInstances(instanceHost);
    else await loadMyInstances();
  };

  const columns: ColumnsType<RuntimeHostItem> = [
    {
      title: '宿主',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Space>
            <Text strong>{record.name}</Text>
            {statusTag(record.enabled ? record.status : 'disabled')}
            {record.source === 'env' && <Tag>环境变量</Tag>}
          </Space>
          <Text type="secondary" className="text-xs">
            {record.baseUrl ?? record.listenAddress ?? '未配置地址'}
            {record.version ? ` · v${record.version}` : ''}
          </Text>
          {record.note && (
            <Text type="secondary" className="text-xs">
              {record.note}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '资源使用',
      key: 'usage',
      width: 260,
      render: (_, record) => {
        const cpuPct = usagePercent(
          record.usage.cpu + record.reservedCpu,
          record.cpuTotal,
        );
        const memPct = usagePercent(
          record.usage.memoryMb + record.reservedMemoryMb,
          record.memoryMbTotal,
        );
        return (
          <div className="flex flex-col gap-1">
            <Space size={4}>
              <Text className="text-xs">CPU</Text>
              <Progress percent={cpuPct} size="small" className="!mb-0 w-[120px]" />
              <Text type="secondary" className="text-xs">
                {record.usage.cpu}/{record.cpuTotal}
              </Text>
            </Space>
            <Space size={4}>
              <Text className="text-xs">内存</Text>
              <Progress percent={memPct} size="small" className="!mb-0 w-[120px]" />
              <Text type="secondary" className="text-xs">
                {Math.round(record.usage.memoryMb / 1024)}/
                {Math.round(record.memoryMbTotal / 1024)} GB
              </Text>
            </Space>
            <Text type="secondary" className="text-xs">
              实例 {record.usage.sandboxCount}/{record.maxSandboxes} · 运行{' '}
              {record.usage.runningCount}
              {record.usage.orphans > 0 ? ` · 孤儿 ${record.usage.orphans}` : ''}
            </Text>
          </div>
        );
      },
    },
    {
      title: '最近检测',
      key: 'checked',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Text className="text-xs">
            {record.lastCheckedAt ? fmtDate(record.lastCheckedAt) : '尚未检测'}
          </Text>
          <Text type="secondary" className="text-xs">
            {record.latencyMs === null ? '—' : `${record.latencyMs} ms`}
          </Text>
          {record.lastError && (
            <Text type="danger" className="text-xs" ellipsis={{ tooltip: record.lastError }}>
              {record.lastError}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button
            size="small"
            icon={<LinkOutlined />}
            onClick={async () => {
              const { error } = await runtimeClient.post(
                '/api/ai/runtime-hosts/:id/refresh',
                { params: { id: record.id } },
              );
              if (error) msg.error('刷新失败');
              else {
                msg.success('已刷新');
                refresh();
              }
            }}
          >
            检测
          </Button>
          <Button size="small" icon={<CloudServerOutlined />} onClick={() => openInstances(record)}>
            实例
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button size="small" onClick={() => handleRotate(record)}>
            轮换
          </Button>
          <Popconfirm
            title="删除宿主？"
            description="该操作不可撤销；存在实例时会要求二次确认。"
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const instanceColumns: ColumnsType<RuntimeInstanceItem> = [
    { title: '用户', dataIndex: 'userId', key: 'userId', width: 160, ellipsis: true },
    { title: 'Agent', dataIndex: 'agentId', key: 'agentId', width: 160, ellipsis: true },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 100,
      render: (state: RuntimeInstanceItem['state']) => {
        const map: Record<string, { color: string; label: string }> = {
          provisioning: { color: 'processing', label: '创建中' },
          running: { color: 'success', label: '运行中' },
          paused: { color: 'warning', label: '已暂停' },
          stopped: { color: 'default', label: '已停止' },
          failed: { color: 'error', label: '失败' },
          lost: { color: 'error', label: '丢失' },
          destroyed: { color: 'default', label: '已销毁' },
        };
        const meta = map[state] ?? { color: 'default', label: state };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '规格',
      key: 'resources',
      width: 180,
      render: (_, record) =>
        `${record.resources.cpuCount}C / ${Math.round(record.resources.memoryMb / 1024)}G / ${Math.round(record.resources.diskMb / 1024)}G`,
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActiveAt',
      key: 'lastActiveAt',
      width: 170,
      render: (value: string | null) => (value ? fmtDate(value) : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          {record.state === 'paused' ? (
            <Button size="small" onClick={() => instanceAction(record, 'resume')}>
              恢复
            </Button>
          ) : (
            <Button size="small" onClick={() => instanceAction(record, 'pause')}>
              暂停
            </Button>
          )}
          <Popconfirm title="销毁该实例？" onConfirm={() => instanceAction(record, 'destroy')}>
            <Button size="small" danger>
              销毁
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (forbidden) {
    return (
      <div>
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="我的虚拟机环境"
          description="你可以查看并释放自己的虚拟机；宿主机配置由平台管理员维护。"
        />
        <Card
          title="我的环境"
          extra={
            <Button icon={<ReloadOutlined />} loading={myLoading} onClick={loadMyInstances}>
              刷新
            </Button>
          }
        >
          <Table
            rowKey="id"
            size="small"
            columns={instanceColumns}
            dataSource={myInstances}
            loading={myLoading}
            pagination={false}
            locale={{ emptyText: '暂无虚拟机环境' }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Row gutter={16} className="mb-4">
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="宿主" value={hosts.length} suffix={`/ ${hosts.filter((h) => h.status === 'online').length} 在线`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="可用实例槽位" value={availability?.capacity.slots ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="空闲 CPU" value={availability?.capacity.cpu ?? 0} suffix="核" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="空闲内存"
              value={Math.round((availability?.capacity.memoryMb ?? 0) / 1024)}
              suffix="GB"
            />
          </Card>
        </Col>
      </Row>

      {availability && availability.warnings.length > 0 && (
        <Alert
          className="mb-4"
          type={availability.available ? 'info' : 'warning'}
          showIcon
          message="资源提示"
          description={availability.warnings.join('；')}
        />
      )}

      <Card
        title={
          <Space>
            <SafetyOutlined />
            <span>虚拟机宿主</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              新增虚拟机
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={hosts}
          loading={loading}
          pagination={false}
          locale={{ emptyText: '尚未接入虚拟机宿主' }}
        />
      </Card>

      <Modal
        title="新增虚拟机宿主"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setCreated(null);
          setPreflight(null);
          setPrecheckAck(false);
          createForm.resetFields();
        }}
        footer={null}
        width={760}
        destroyOnHidden
      >
        {!created ? (
          <>
            <Card
              size="small"
              title="添加前机器预检"
              loading={preflightLoading}
              className="mt-3"
            >
              <Alert
                type="info"
                showIcon
                className="mb-3"
                message="目标宿主机必须满足以下要求；预检通过后再添加"
              />
              <ul className="mb-3 list-disc pl-5 text-xs leading-6">
                {(preflight?.requirements ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {preflight?.command && (
                <>
                  <Text strong className="text-xs">在目标宿主机以 root 执行：</Text>
                  <Paragraph
                    copyable={{ text: preflight.command, tooltips: ['复制预检命令', '已复制'] }}
                    className="mt-1"
                  >
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 text-[11px]">
                      {preflight.command}
                    </pre>
                  </Paragraph>
                </>
              )}
              <Checkbox
                checked={precheckAck}
                onChange={(event) => setPrecheckAck(event.target.checked)}
              >
                我已在目标宿主机执行预检，且全部 PASS
              </Checkbox>
            </Card>
            <Form form={createForm} layout="vertical" className="mt-3">
            <Form.Item
              label="名称"
              name="name"
              rules={[{ required: true, message: '请输入宿主名称' }]}
            >
              <Input placeholder="例如：firecracker-host-01" maxLength={128} />
            </Form.Item>
            <Form.Item label="备注" name="note">
              <Input.TextArea rows={2} maxLength={500} placeholder="机房、用途等" />
            </Form.Item>
            <Form.Item
              label="宿主机监听地址"
              name="listenAddress"
              rules={[{ required: true, message: '请输入 IP:PORT' }]}
              tooltip="Runtime 只监听该内网地址，例如 10.0.0.12:8088"
            >
              <Input placeholder="10.0.0.12:8088" maxLength={255} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item label="CPU（可选）" name="cpuTotal">
                  <InputNumber min={0} max={1024} className="w-full" placeholder="自动探测" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="内存 MB（可选）" name="memoryMbTotal">
                  <InputNumber min={0} max={4_194_304} className="w-full" placeholder="自动探测" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="磁盘 MB（可选）" name="diskMbTotal">
                  <InputNumber min={0} max={33_554_432} className="w-full" placeholder="自动探测" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="最大沙箱数" name="maxSandboxes">
                  <InputNumber min={1} max={10_000} className="w-full" placeholder="20" />
                </Form.Item>
              </Col>
            </Row>
            <Button
              type="primary"
              loading={creating}
              onClick={handleCreate}
              disabled={!precheckAck}
              block
            >
              生成安装命令
            </Button>
          </Form>
          </>
        ) : (
          <div className="mt-3">
            <Alert
              type="warning"
              showIcon
              message="安装命令包含一次性 Bearer Token，请勿外传"
              description="在支持 KVM 的 Linux 宿主机上以 root 执行；服务启动后再回到这里填写连接地址并检测。"
            />
            <Card size="small" className="my-4">
              <Paragraph copyable={{ text: created.installCommand, tooltips: ['复制命令', '已复制'] }}>
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {created.installCommand}
                </pre>
              </Paragraph>
            </Card>
            <Form layout="vertical">
              <Form.Item label="后端可访问的宿主地址" required>
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="http://10.0.0.12:8088"
                />
              </Form.Item>
            </Form>
            <Space>
              <Button type="primary" loading={verifying} onClick={handleVerify}>
                检测连接
              </Button>
              <Button onClick={refresh}>刷新状态</Button>
              <Button
                onClick={() => {
                  setCreated(null);
                  createForm.resetFields();
                }}
              >
                重新填写
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      <Modal
        title="编辑虚拟机宿主"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" className="mt-3">
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="CPU" name="cpuTotal">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="内存 MB" name="memoryMbTotal">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="磁盘 MB" name="diskMbTotal">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="最大沙箱数" name="maxSandboxes">
                <InputNumber min={1} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={`实例 · ${instanceHost?.name ?? ''}`}
        open={instancesOpen}
        onClose={() => setInstancesOpen(false)}
        size="large"
      >
        {instanceHost && (
          <Descriptions size="small" column={2} className="mb-4">
            <Descriptions.Item label="地址">{instanceHost.baseUrl ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(instanceHost.status)}</Descriptions.Item>
            <Descriptions.Item label="版本">{instanceHost.version ?? '未知'}</Descriptions.Item>
            <Descriptions.Item label="最近检测">
              {instanceHost.lastCheckedAt ? fmtDate(instanceHost.lastCheckedAt) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Table
          rowKey="id"
          size="small"
          columns={instanceColumns}
          dataSource={instances}
          loading={instancesLoading}
          pagination={false}
          locale={{ emptyText: '暂无实例' }}
        />
      </Drawer>
    </div>
  );
}
