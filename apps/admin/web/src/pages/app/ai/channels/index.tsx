/**
 * 对话渠道（个人级）
 *
 * 一句话定位：把微信 / QQ / 飞书 / 企业微信 / 钉钉 / MQTT 设备接成「同一个 AI 会话的
 * 另一个出入口」——渠道里发的消息进的是你的 AI 会话，AI 的回复与任务结果也能推回渠道。
 *
 * 页面职责只有三件事：配置渠道、启停连接、管理账号绑定。
 * 表单与提示全部由后端目录（/api/ai/channels/catalog）驱动，新增渠道类型无需改这个文件。
 */
import { msg } from '@/components/GlobalMessage';
import { MessageOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteChannel,
  fetchCatalog,
  fetchChannels,
  sendTestMessage,
  setChannelEnabled,
} from './api';
import AddChannelModal from './components/add-channel-modal';
import BindModal from './components/bind-modal';
import ChannelCard from './components/channel-card';
import ChannelFormModal from './components/channel-form-modal';
import MessagesDrawer from './components/messages-drawer';
import QrLoginModal from './components/qr-login-modal';
import type { ChannelCatalogEntry, ChannelItem } from './types';

const { Text } = Typography;

export default function AiChannelsPage() {
  const [catalog, setCatalog] = useState<ChannelCatalogEntry[]>([]);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // 弹窗状态：同一时刻只开一个，避免多层遮罩
  const [addOpen, setAddOpen] = useState(false);
  const [formEntry, setFormEntry] = useState<ChannelCatalogEntry | null>(null);
  const [editing, setEditing] = useState<ChannelItem | null>(null);
  const [bindTarget, setBindTarget] = useState<ChannelItem | null>(null);
  const [qrTarget, setQrTarget] = useState<ChannelItem | null>(null);
  const [msgTarget, setMsgTarget] = useState<ChannelItem | null>(null);

  const catalogMap = useMemo(() => {
    const map = new Map<string, ChannelCatalogEntry>();
    for (const entry of catalog) map.set(entry.type, entry);
    return map;
  }, [catalog]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogData, listData] = await Promise.all([fetchCatalog(), fetchChannels()]);
      if (catalogData) {
        setCatalog(catalogData.items ?? []);
        setPublicBaseUrl(catalogData.publicBaseUrl ?? null);
      }
      if (listData) setChannels(listData.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEnabled = useCallback(
    async (channel: ChannelItem, enabled: boolean) => {
      setSwitchingId(channel.id);
      try {
        const next = await setChannelEnabled(channel.id, enabled);
        if (!next) return;
        msg.success(enabled ? '已启用，正在建立连接' : '已停用');
        setChannels((prev) => prev.map((item) => (item.id === next.id ? next : item)));
        // 连接状态是异步上来的（长连接/扫码类），稍后再拉一次
        setTimeout(() => void refresh(), 1200);
      } finally {
        setSwitchingId(null);
      }
    },
    [refresh],
  );

  const sendTest = useCallback(async (channel: ChannelItem) => {
    const result = await sendTestMessage(channel.id);
    if (result) msg.success('测试消息已发出，去渠道里看看是否收到');
  }, []);

  const remove = useCallback(
    async (channel: ChannelItem) => {
      const result = await deleteChannel(channel.id);
      if (result) {
        msg.success('已删除');
        await refresh();
      }
    },
    [refresh],
  );

  const handlePick = useCallback((entry: ChannelCatalogEntry) => {
    setAddOpen(false);
    setEditing(null);
    setFormEntry(entry);
  }, []);

  const handleEdit = useCallback(
    (channel: ChannelItem) => {
      setEditing(channel);
      setFormEntry(catalogMap.get(channel.type) ?? null);
    },
    [catalogMap],
  );

  return (
    <Card
      title={
        <Space>
          <MessageOutlined />
          <span>对话渠道</span>
          {channels.length > 0 ? (
            <Text type="secondary" className="text-xs">
              已配置 {channels.length} 个
            </Text>
          ) : null}
        </Space>
      }
      extra={
        <Space size={6}>
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            添加渠道
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="渠道是同一个 AI 会话的另一个出入口"
        description="在渠道里发消息 = 在你的 AI 会话里提问；对话页开启「渠道通知」后，任务结果会由子智能体总结后推给你，你可以在渠道里直接接着追问。"
      />

      <Spin spinning={loading && channels.length === 0}>
        {channels.length === 0 ? (
          <Empty
            className="my-12"
            description={
              <Space orientation="vertical" size={4}>
                <Text>还没有配置任何渠道</Text>
                <Text type="secondary" className="text-xs">
                  点右上角「添加渠道」，微信扫码即可用，不需要公网地址
                </Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              添加渠道
            </Button>
          </Empty>
        ) : (
          <Row gutter={[12, 12]}>
            {channels.map((channel) => (
              <Col span={12} key={channel.id}>
                <ChannelCard
                  channel={channel}
                  catalogName={catalogMap.get(channel.type)?.name ?? channel.type}
                  switching={switchingId === channel.id}
                  onToggleEnabled={toggleEnabled}
                  onEdit={handleEdit}
                  onBind={setBindTarget}
                  onQrLogin={setQrTarget}
                  onMessages={setMsgTarget}
                  onTest={sendTest}
                  onDelete={remove}
                />
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <AddChannelModal
        open={addOpen}
        catalog={catalog}
        publicBaseUrl={publicBaseUrl}
        onClose={() => setAddOpen(false)}
        onPick={handlePick}
      />

      <ChannelFormModal
        open={formEntry !== null}
        entry={formEntry}
        channel={editing}
        onClose={() => {
          setFormEntry(null);
          setEditing(null);
        }}
        onSaved={(channel) => {
          setChannels((prev) => {
            const exists = prev.some((item) => item.id === channel.id);
            return exists
              ? prev.map((item) => (item.id === channel.id ? channel : item))
              : [...prev, channel];
          });
        }}
      />

      <BindModal
        open={bindTarget !== null}
        channel={bindTarget}
        onClose={() => setBindTarget(null)}
      />

      <QrLoginModal
        open={qrTarget !== null}
        channel={qrTarget}
        onClose={() => setQrTarget(null)}
        onConfirmed={() => {
          setQrTarget(null);
          void refresh();
        }}
      />

      <MessagesDrawer
        open={msgTarget !== null}
        channel={msgTarget}
        onClose={() => setMsgTarget(null)}
      />
    </Card>
  );
}
