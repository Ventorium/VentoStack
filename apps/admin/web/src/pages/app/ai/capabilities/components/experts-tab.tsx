/**
 * AI 智能能力管理 — 专家 (Experts)
 * 市场浏览（远程 manifest）/ 批量安装 / 已安装管理（启停/升级/卸载）
 */
import { client } from '@/api';
import { msg } from '@/components/GlobalMessage';
import { fmtDate } from '@/utils/fmtDate';
import {
  CloseCircleOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

const { Text, Paragraph } = Typography;

interface HubCategory {
  id: string;
  name: string;
  nameEn?: string;
}

interface RemoteExpert {
  slug: string;
  categoryId: string;
  name: string;
  nameEn?: string;
  description: string;
  version: string;
  expertType?: 'agent' | 'team';
  members?: string[];
  tags?: string[];
  quickPrompts?: string[];
}

interface RemoteList {
  manifestVersion: string;
  lastUpdated: string;
  categories: HubCategory[];
  experts: RemoteExpert[];
}

interface ExpertItem {
  id: string;
  slug: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  latestVersion: string | null;
  installedVersion: string | null;
  scanStatus: 'pending' | 'passed' | 'failed';
  enabled: boolean;
  hasUpdate: boolean;
  installedAt: string | null;
}

interface PaginatedData<T> {
  list: T[];
  total: number;
}

const scanTag = (status: ExpertItem['scanStatus']) => {
  if (status === 'passed')
    return (
      <Tag icon={<SafetyCertificateOutlined />} color="success">
        扫描通过
      </Tag>
    );
  if (status === 'failed')
    return (
      <Tag icon={<CloseCircleOutlined />} color="error">
        扫描未过
      </Tag>
    );
  return (
    <Tag icon={<ExclamationCircleOutlined />} color="warning">
      待扫描
    </Tag>
  );
};

export default function ExpertsTab() {
  const { token } = theme.useToken();
  const [mode, setMode] = useState<'installed' | 'store'>('installed');

  // 已安装
  const [installed, setInstalled] = useState<ExpertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 市场
  const [remote, setRemote] = useState<RemoteList | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get('/api/ai/experts', {
        query: { page, pageSize: 20 },
      })) as { error?: unknown; data?: PaginatedData<ExpertItem> };
      if (!error && data) {
        setInstalled(data.list);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadRemote = useCallback(async () => {
    setRemoteLoading(true);
    setHubError(null);
    try {
      const { error, data } = (await client.get('/api/ai/experts/hub/manifest', {
        query: {
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(categoryId ? { categoryId } : {}),
        },
      })) as { error?: unknown; data?: RemoteList & { message?: string } };
      if (!error && data) {
        setRemote(data);
      } else {
        setHubError('无法连接专家市场（hub 不可达或 manifest 校验失败）');
      }
    } finally {
      setRemoteLoading(false);
    }
  }, [keyword, categoryId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在首次进入市场页时懒加载 manifest
  useEffect(() => {
    if (mode === 'store' && !remote) loadRemote();
  }, [mode]);

  const installedSlugs = new Set(installed.map((e) => e.slug));

  const installBatch = async (slugs: string[]) => {
    if (slugs.length === 0) return;
    setInstalling(true);
    try {
      const { error, data } = (await client.post('/api/ai/experts/hub/install', {
        body: { slugs },
      })) as {
        error?: unknown;
        data?: { installed: ExpertItem[]; failed: Array<{ slug: string; reason: string }> };
      };
      if (!error && data) {
        const failCount = data.failed.length;
        if (failCount > 0) {
          msg.warning(
            `安装完成：成功 ${data.installed.length} 个，失败 ${failCount} 个（未通过安全扫描或下载失败）`,
          );
        } else {
          msg.success(`成功安装 ${data.installed.length} 个专家`);
        }
        setSelectedSlugs([]);
        await refresh();
      }
    } finally {
      setInstalling(false);
    }
  };

  const toggleEnabled = async (record: ExpertItem, enabled: boolean) => {
    const { error } = (await client.put(`/api/ai/experts/${record.id}`, {
      body: { enabled },
    })) as {
      error?: unknown;
    };
    if (!error) {
      msg.success(enabled ? `已启用「${record.name}」` : `已停用「${record.name}」`);
      await refresh();
    }
  };

  const uninstall = async (record: ExpertItem) => {
    const { error } = (await client.delete(`/api/ai/experts/${record.id}`)) as { error?: unknown };
    if (!error) {
      msg.success(`已卸载「${record.name}」`);
      await refresh();
    }
  };

  const upgrade = async (record: ExpertItem) => {
    const { error } = (await client.post(`/api/ai/experts/${record.id}/upgrade`)) as {
      error?: unknown;
    };
    if (!error) {
      msg.success(`「${record.name}」已升级到 ${record.latestVersion ?? '最新版'}`);
      await refresh();
    }
  };

  // 说明：专家的使用方式为「对话窗口召唤」（会话级 Role Override，见 chat 页 ExpertSummon），
  // 不再提供"实例化为 Agent"入口；后端 instantiate API 保留兼容。

  const checkUpdates = async () => {
    const { error, data } = (await client.post('/api/ai/experts/check-updates')) as {
      error?: unknown;
      data?: { count: number };
    };
    if (!error && data) {
      if (data.count > 0) {
        msg.info(`发现 ${data.count} 个可更新专家，请在列表中逐个升级`);
      } else {
        msg.success('全部专家均为最新版本');
      }
      await refresh();
    }
  };

  const installedColumns: ColumnsType<ExpertItem> = [
    {
      title: '专家',
      dataIndex: 'name',
      width: 240,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.slug}
          </Text>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'categoryId',
      width: 130,
      render: (v) => remote?.categories.find((c) => c.id === v)?.name ?? v ?? '-',
    },
    {
      title: '版本',
      width: 170,
      render: (_, r) =>
        r.hasUpdate ? (
          <Badge
            status="warning"
            text={`${r.installedVersion ?? '-'} → ${r.latestVersion ?? '-'}`}
          />
        ) : (
          <Text>{r.installedVersion ?? '-'}</Text>
        ),
    },
    { title: '安全扫描', dataIndex: 'scanStatus', width: 130, render: (v) => scanTag(v) },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 90,
      render: (_, r) => (
        <Switch
          checked={r.enabled}
          disabled={r.scanStatus !== 'passed'}
          onChange={(v) => toggleEnabled(r, v)}
        />
      ),
    },
    {
      title: '安装时间',
      dataIndex: 'installedAt',
      width: 160,
      render: (v) => (v ? fmtDate(v) : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 230,
      render: (_, r) => (
        <Space>
          {r.hasUpdate && (
            <Button
              size="small"
              type="link"
              icon={<CloudSyncOutlined />}
              onClick={() => upgrade(r)}
            >
              升级
            </Button>
          )}
          <Popconfirm
            title="确认卸载该专家？"
            description="将删除本地文件与管理记录"
            onConfirm={() => uninstall(r)}
          >
            <Button size="small" type="link" danger>
              卸载
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card
        size="small"
        title={
          <Space>
            <TeamOutlined />
            <span>专家 Experts</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
              会话级角色绑定：通过 chat 接口 expertId 使用
            </Text>
          </Space>
        }
        extra={
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as 'installed' | 'store')}
            options={[
              { value: 'installed', label: '已安装', icon: <ThunderboltOutlined /> },
              { value: 'store', label: '专家市场', icon: <CloudDownloadOutlined /> },
            ]}
          />
        }
      >
        {mode === 'installed' ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={refresh}>
                刷新
              </Button>
              <Button icon={<CloudSyncOutlined />} onClick={checkUpdates}>
                检查更新
              </Button>
            </Space>
            <Table<ExpertItem>
              rowKey="id"
              loading={loading}
              columns={installedColumns}
              dataSource={installed}
              pagination={{
                current: page,
                total,
                pageSize: 20,
                onChange: setPage,
                showTotal: (t) => `共 ${t} 个`,
              }}
            />
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Input.Search
                placeholder="搜索名称 / 描述 / 标签"
                allowClear
                style={{ width: 280 }}
                onSearch={(v) => {
                  setKeyword(v);
                  setTimeout(() => loadRemote(), 0);
                }}
              />
              <Select
                allowClear
                placeholder="全部分类"
                style={{ width: 160 }}
                value={categoryId}
                onChange={(v) => setCategoryId(v)}
                options={(remote?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                disabled={selectedSlugs.length === 0 || installing}
                loading={installing}
                onClick={() => installBatch(selectedSlugs)}
              >
                批量安装{selectedSlugs.length > 0 ? `（${selectedSlugs.length}）` : ''}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadRemote} loading={remoteLoading}>
                刷新市场
              </Button>
              {remote && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  manifest v{remote.manifestVersion} · 更新于 {fmtDate(remote.lastUpdated)}
                </Text>
              )}
            </Space>
            {hubError ? (
              <Empty description={hubError}>
                <Button onClick={loadRemote}>重试</Button>
              </Empty>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 12,
                }}
              >
                {(remote?.experts ?? []).map((e) => {
                  const isInstalled = installedSlugs.has(e.slug);
                  const checked = selectedSlugs.includes(e.slug);
                  return (
                    <Card
                      key={e.slug}
                      size="small"
                      style={{
                        borderColor: checked ? token.colorPrimary : undefined,
                        opacity: isInstalled ? 0.65 : 1,
                      }}
                      title={
                        <Space size={6}>
                          {!isInstalled && (
                            <Checkbox
                              checked={checked}
                              onChange={(ev) =>
                                setSelectedSlugs((prev) =>
                                  ev.target.checked
                                    ? [...prev, e.slug]
                                    : prev.filter((s) => s !== e.slug),
                                )
                              }
                            />
                          )}
                          <Text strong>{e.name}</Text>
                          {isInstalled && <Tag color="success">已安装</Tag>}
                        </Space>
                      }
                      extra={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          v{e.version}
                        </Text>
                      }
                    >
                      <Paragraph
                        ellipsis={{ rows: 2, expandable: true, symbol: '更多' }}
                        type="secondary"
                        style={{ marginBottom: 8, minHeight: 44 }}
                      >
                        {e.description}
                      </Paragraph>
                      <Space size={4} wrap style={{ marginBottom: e.quickPrompts?.length ? 8 : 0 }}>
                        {e.expertType === 'team' ? (
                          <Tag color="purple">团队 · {e.members?.length ?? 0} 名成员</Tag>
                        ) : (
                          <Tag>
                            {remote?.categories.find((c) => c.id === e.categoryId)?.name ??
                              e.categoryId}
                          </Tag>
                        )}
                        {(e.tags ?? []).slice(0, 3).map((t) => (
                          <Tag key={t} color="blue">
                            {t}
                          </Tag>
                        ))}
                      </Space>
                      {e.quickPrompts?.length ? (
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            快捷：{e.quickPrompts.slice(0, 2).join(' / ')}
                          </Text>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
                {!remoteLoading && (remote?.experts.length ?? 0) === 0 && (
                  <Empty description="没有匹配的专家" style={{ gridColumn: '1 / -1' }} />
                )}
              </div>
            )}
          </Space>
        )}
      </Card>
    </Space>
  );
}
