/**
 * 收发记录抽屉
 *
 * 只展示脱敏预览：控制面不暴露完整正文，排查问题看「状态 + 失败原因 + 重试次数」即可。
 * 出站失败会按指数退避重试（1s → 5s → 30s → 2m → 10m，最多 5 次）。
 *
 * 注意：表格必须拆成内层组件、且只在拿到 channelId 后挂载。
 * `useTable` 在 mount 时无条件拉第一页（它对所有列表页都是这个语义，不能改），
 * 若把 useTable 放在常驻挂载的抽屉里，页面一打开就会用空 id 请求
 * `/api/ai/channels//messages`；而且切换渠道时 fetcher 虽变、mount 效应已跑过，
 * 数据不会刷新，会看到上一个渠道的记录。
 */
import { useTable } from '@/hooks/useTable';
import { Drawer, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback } from 'react';
import { fetchMessages } from '../api';
import type { ChannelItem, ChannelMessageItem } from '../types';

const { Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  done: 'success',
  sent: 'success',
  processing: 'processing',
  sending: 'processing',
  pending: 'default',
  failed: 'error',
  dropped: 'warning',
};

interface MessagesDrawerProps {
  open: boolean;
  channel: ChannelItem | null;
  onClose: () => void;
}

export default function MessagesDrawer({ open, channel, onClose }: MessagesDrawerProps) {
  return (
    <Drawer
      title={`「${channel?.name ?? ''}」最近收发`}
      open={open}
      onClose={onClose}
      size={880}
      destroyOnHidden
    >
      {/* key 用渠道 id：换渠道时强制重挂载，重新拉第一页且不带上一个渠道的残留数据 */}
      {channel ? <MessagesTable key={channel.id} channelId={channel.id} /> : null}
    </Drawer>
  );
}

function MessagesTable({ channelId }: { channelId: string }) {
  const fetcher = useCallback(
    async (params: { page?: number; pageSize?: number }) => {
      const data = await fetchMessages(channelId, params.page ?? 1, params.pageSize ?? 20);
      // useTable 期望 { error, data } 形状，这里补一层适配
      return data ? { data } : { error: true };
    },
    [channelId],
  );

  const table = useTable<ChannelMessageItem>(fetcher, { defaultPageSize: 20 });

  const columns: ColumnsType<ChannelMessageItem> = [
    {
      title: '方向',
      dataIndex: 'direction',
      width: 70,
      render: (value: string) =>
        value === 'in' ? <Tag color="blue">入站</Tag> : <Tag color="green">出站</Tag>,
    },
    {
      title: '内容预览',
      dataIndex: 'preview',
      ellipsis: true,
      render: (value: string) => <Text className="text-xs">{value || '—'}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={STATUS_COLOR[value] ?? 'default'}>{value}</Tag>,
    },
    {
      title: '失败原因',
      dataIndex: 'error',
      width: 180,
      ellipsis: true,
      render: (value: string | null) =>
        value ? (
          <Text type="danger" className="text-[11px]">
            {value}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: '重试',
      dataIndex: 'attempts',
      width: 60,
      align: 'center',
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
  ];

  return (
    <Table
      size="small"
      rowKey="id"
      loading={table.loading}
      columns={columns}
      dataSource={table.data}
      scroll={{ x: 760 }}
      pagination={{
        current: table.page,
        pageSize: table.pageSize,
        total: table.total,
        onChange: table.onPageChange,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
    />
  );
}
