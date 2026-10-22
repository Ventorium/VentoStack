/**
 * 单个渠道卡片
 *
 * 状态灯 + 一行操作：启用/停用、配置、绑定、扫码、记录、删除。
 * 卡片上直接把「回调地址」摆出来（可一键复制），因为填错地址是 webhook 类渠道最常见的失败原因。
 */
import {
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  QrcodeOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Badge, Button, Card, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { ChannelItem } from '../types';
import { CHANNEL_STATUS_META, TRANSPORT_LABEL } from '../types';

const { Text } = Typography;

interface ChannelCardProps {
  channel: ChannelItem;
  catalogName: string;
  switching: boolean;
  onToggleEnabled: (channel: ChannelItem, enabled: boolean) => void;
  onEdit: (channel: ChannelItem) => void;
  onBind: (channel: ChannelItem) => void;
  onQrLogin: (channel: ChannelItem) => void;
  onMessages: (channel: ChannelItem) => void;
  onTest: (channel: ChannelItem) => void;
  onDelete: (channel: ChannelItem) => void;
}

export default function ChannelCard({
  channel,
  catalogName,
  switching,
  onToggleEnabled,
  onEdit,
  onBind,
  onQrLogin,
  onMessages,
  onTest,
  onDelete,
}: ChannelCardProps) {
  const meta = CHANNEL_STATUS_META[channel.status] ?? { color: 'default', label: channel.status };

  return (
    <Card
      size="small"
      className="h-full"
      title={
        <Space size={6} className="min-w-0">
          <Badge status={channel.status === 'active' ? 'success' : 'default'} />
          <Text strong className="truncate text-[13px]">
            {channel.name}
          </Text>
          <Tag className="text-[10px]">{catalogName}</Tag>
          <Tag className="text-[10px]">{TRANSPORT_LABEL[channel.transport]}</Tag>
        </Space>
      }
      extra={
        <Tooltip title={channel.enabled ? '停用后不再收消息' : '启用后会立即建立连接'}>
          <Switch
            size="small"
            checked={channel.enabled}
            loading={switching}
            onChange={(checked) => onToggleEnabled(channel, checked)}
          />
        </Tooltip>
      }
    >
      <Space orientation="vertical" size={6} className="w-full">
        <Space size={6}>
          <Tag color={meta.color}>{meta.label}</Tag>
          {channel.statusDetail ? (
            <Text type="secondary" className="text-[11px]" ellipsis>
              {channel.statusDetail}
            </Text>
          ) : null}
        </Space>

        {channel.webhookUrl ? (
          <div>
            <Text type="secondary" className="text-[11px]">
              回调地址（填到平台后台）
            </Text>
            <Text className="block font-mono text-[11px]" copyable={{ text: channel.webhookUrl }}>
              {channel.webhookUrl}
            </Text>
          </div>
        ) : null}

        <Text type="secondary" className="text-[11px]">
          {channel.hasSecret ? `凭证已配置（${channel.secretKeys.length} 项）` : '尚未配置凭证'}
          {channel.lastActiveAt
            ? ` · 最近活跃 ${new Date(channel.lastActiveAt).toLocaleString()}`
            : ' · 还没有收发记录'}
        </Text>

        <Space size={4} wrap>
          {channel.requiresLogin ? (
            <Button size="small" icon={<QrcodeOutlined />} onClick={() => onQrLogin(channel)}>
              扫码登录
            </Button>
          ) : null}
          <Button size="small" icon={<UserAddOutlined />} onClick={() => onBind(channel)}>
            绑定账号
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(channel)}>
            配置
          </Button>
          <Button size="small" icon={<SwapOutlined />} onClick={() => onTest(channel)}>
            测试
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => onMessages(channel)}>
            记录
          </Button>
          <Popconfirm
            title="删除渠道"
            description="会断开连接并清除绑定关系，AI 会话本身不受影响。"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(channel)}
          >
            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </Space>
    </Card>
  );
}
