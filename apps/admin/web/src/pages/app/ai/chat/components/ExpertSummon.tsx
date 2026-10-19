import { client } from '@/api';
/**
 * 召唤专家（会话级专家绑定 UI）
 *
 * 在对话窗口选择已安装专家即可"召唤"：本次会话后续消息以专家逻辑覆盖 Agent 人设
 * （后端 Role Override）；取消召唤回落到 Agent 自身配置；切换专家即覆盖为新的专家逻辑。
 * 选择结果由父组件按会话持久化（localStorage），仅影响请求参数 expertId。
 */
import { CloseCircleOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { Button, Empty, Popover, Spin, Tag, theme } from 'antd';
import { useCallback, useEffect, useState } from 'react';

export interface SummonedExpert {
  id: string;
  name: string;
  slug?: string;
}

interface ExpertItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  expertType?: string;
  enabled: boolean;
}

export default function ExpertSummon({
  value,
  onChange,
  disabled,
}: {
  value: SummonedExpert | null;
  onChange?: (expert: SummonedExpert | null) => void;
  disabled?: boolean;
}) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [experts, setExperts] = useState<ExpertItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get('/api/ai/experts', {
        query: { pageSize: '100' },
      })) as { error?: unknown; data?: { items?: ExpertItem[]; list?: ExpertItem[] } };
      if (!error && data) {
        const items = data.items ?? data.list ?? [];
        setExperts(items.filter((e) => e.enabled));
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  const pick = (expert: ExpertItem) => {
    onChange?.({ id: expert.id, name: expert.name, slug: expert.slug });
    setOpen(false);
  };

  const body = (
    <div className="w-72 p-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs" style={{ color: token.colorTextSecondary }}>
          召唤专家
        </span>
        {value && (
          <Button
            type="text"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => {
              onChange?.(null);
              setOpen(false);
            }}
          >
            取消召唤
          </Button>
        )}
      </div>
      {loading && !loaded ? (
        <div className="flex justify-center py-6">
          <Spin size="small" />
        </div>
      ) : experts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无已安装专家（可在 AI 能力 → 专家 安装）"
          className="py-2"
        />
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {experts.map((expert) => {
            const active = value?.id === expert.id;
            return (
              <Button
                key={expert.id}
                type="text"
                block
                className="h-auto py-2 rounded-lg text-left"
                onClick={() => pick(expert)}
              >
                <span className="flex w-full items-start gap-2">
                  <span className="shrink-0 pt-0.5" style={{ color: token.colorTextSecondary }}>
                    <TeamOutlined />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="flex items-center gap-1 text-sm"
                      style={{ color: active ? token.colorPrimary : undefined }}
                    >
                      {expert.name}
                      {expert.expertType === 'team' && (
                        <Tag className="mr-0 px-1 text-[10px] leading-4">团队</Tag>
                      )}
                      {active && <span>✓</span>}
                    </span>
                    {expert.description && (
                      <span
                        className="block truncate text-xs"
                        style={{ color: token.colorTextTertiary }}
                      >
                        {expert.description}
                      </span>
                    )}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}
      <div
        className="mt-1 border-0 border-t border-solid px-2 pt-2 text-xs"
        style={{ borderColor: token.colorBorderSecondary, color: token.colorTextTertiary }}
      >
        召唤后专家逻辑覆盖该 Agent 的人设；取消召唤即恢复。
      </div>
    </div>
  );

  return (
    <Popover trigger="click" placement="topRight" open={open} onOpenChange={setOpen} content={body}>
      <Button
        type="text"
        aria-label="召唤专家"
        disabled={disabled}
        className="max-w-[220px] rounded-full px-3"
        style={value ? { background: token.colorPrimaryBg, color: token.colorPrimary } : undefined}
      >
        <span className="flex items-center gap-1.5">
          <span className="shrink-0">{value ? <TeamOutlined /> : <UserAddOutlined />}</span>
          <span
            className="max-w-[140px] truncate text-xs"
            style={{ color: value ? token.colorPrimary : token.colorTextSecondary }}
          >
            {value ? value.name : '召唤专家'}
          </span>
        </span>
      </Button>
    </Popover>
  );
}
