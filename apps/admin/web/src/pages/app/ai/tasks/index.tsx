import { client } from '@/api';
import { useTable } from '@/hooks/useTable';
import { cleanParams } from '@/utils/cleanParams';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useState } from 'react';
import TaskDetailDrawer from './components/task-detail-drawer';
import { useTaskActions } from './hooks';
import {
  type BackgroundTaskItem,
  TASK_STATUS_META,
  formatDateTime,
  formatNextRun,
  formatSchedule,
} from './types';

interface TaskListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  [key: string]: unknown;
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(TASK_STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
];

/** 后台任务总览：跨会话查看 Agent 布置的脚本任务与定时唤醒任务 */
export default function BackgroundTasksPage(): React.ReactElement {
  const [detail, setDetail] = useState<BackgroundTaskItem | null>(null);
  const [searchText, setSearchText] = useState('');
  const fetcher = useCallback(
    (params: TaskListParams) =>
      client.get('/api/ai/background-tasks', {
        query: cleanParams({
          page: params.page,
          pageSize: params.pageSize,
          keyword: params.keyword,
          status: params.status,
        }),
      }),
    [],
  );
  const table = useTable<BackgroundTaskItem, TaskListParams>(fetcher, {
    defaultPageSize: 10,
    defaultParams: { status: '' },
  });
  const { act } = useTaskActions(table.refresh);

  const columns: ColumnsType<BackgroundTaskItem> = [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (_, task) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{task.title}</span>
          <Space size={4}>
            <Tag className="m-0" color={task.kind === 'script' ? 'purple' : 'cyan'}>
              {task.kind === 'script' ? '脚本' : '定时'}
            </Tag>
            <span className="text-xs opacity-60">会话 {task.sessionId.slice(0, 8)}</span>
          </Space>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (_, task) => {
        const meta = TASK_STATUS_META[task.status];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '规则',
      key: 'schedule',
      width: 200,
      ellipsis: true,
      render: (_, task) => formatSchedule(task),
    },
    {
      title: '下次触发',
      key: 'nextRunAt',
      width: 150,
      render: (_, task) =>
        task.kind === 'schedule' && task.nextRunAt ? (
          <Tooltip title={formatDateTime(task.nextRunAt)}>
            <span>{formatNextRun(task)}</span>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: '触发次数',
      key: 'runCount',
      width: 90,
      render: (_, task) =>
        task.kind === 'schedule' ? `${task.runCount} / ${task.maxRuns}` : `${task.runCount}`,
    },
    {
      title: '最近错误',
      dataIndex: 'lastError',
      key: 'lastError',
      width: 200,
      ellipsis: true,
      render: (value: string | null) =>
        value ? (
          <Tooltip title={value}>
            <span className="text-xs text-red-500">{value}</span>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, task) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => setDetail(task)}>
            详情
          </Button>
          {task.status === 'paused' ? (
            <Button type="link" size="small" onClick={() => void act('resume', task)}>
              恢复
            </Button>
          ) : task.status === 'running' ? (
            <Button type="link" size="small" danger onClick={() => void act('cancel', task)}>
              取消
            </Button>
          ) : (
            <Button type="link" size="small" danger onClick={() => void act('cancel', task)}>
              取消
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card className="m-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索任务名称"
            style={{ width: 240 }}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onSearch={(value) => table.onSearch({ keyword: value, page: 1 })}
          />
          <Select
            value={(table.params.status as string) ?? ''}
            options={STATUS_OPTIONS}
            style={{ width: 140 }}
            onChange={(value) => table.onSearch({ status: value, page: 1 })}
          />
        </Space>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={table.loading}
            onClick={() => void table.refresh()}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Table<BackgroundTaskItem>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={table.data}
        loading={table.loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: table.page,
          pageSize: table.pageSize,
          total: table.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, pageSize) => table.onPageChange(page, pageSize),
        }}
      />

      <TaskDetailDrawer task={detail} open={detail !== null} onClose={() => setDetail(null)} />
    </Card>
  );
}
