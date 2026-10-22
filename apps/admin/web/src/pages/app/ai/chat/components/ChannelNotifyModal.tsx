import { BellOutlined } from '@ant-design/icons';
import { Alert, Checkbox, Divider, Empty, Modal, Space, Spin, Switch, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
/**
 * 会话级「渠道通知」设置
 *
 * 两个开关分工（模型自己调工具 vs 系统兜底）：
 *   启用渠道通知    → 给模型加上 channel_list / channel_send 两个工具，
 *                     你可以直接说「把结果发到我 QQ」
 *   每轮结束自动推送 → 不管模型有没有调工具，都由子智能体把最后一次完整回复
 *                     总结成一条通知，推到你勾选的渠道
 *
 * 设置落在 ai_session_meta.settings.channel（入库而非 jsonl），
 * 因为自动推送要按「哪些会话开了通知」扫描，jsonl 无法索引。
 */
import { fetchNotifySettings, patchNotifySettings } from '../../channels/api';

const { Text } = Typography;

interface ChannelNotifyModalProps {
  open: boolean;
  sessionId?: string;
  onClose: () => void;
}

interface NotifyView {
  settings: {
    notifyEnabled?: boolean;
    notifyChannelIds?: string[];
    autoNotifyOnFinish?: boolean;
    notifiedAt?: string | null;
  } | null;
  available: Array<{ id: string; type: string; name: string; bound: boolean }>;
}

export default function ChannelNotifyModal({ open, sessionId, onClose }: ChannelNotifyModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<NotifyView | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await fetchNotifySettings(sessionId);
      if (data) setView(data as NotifyView);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId) void load();
  }, [open, sessionId, load]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!sessionId) return;
      setSaving(true);
      try {
        const data = await patchNotifySettings(sessionId, body);
        if (!data) return;
        setView((prev) => (prev ? { ...prev, settings: data.settings } : prev));
      } finally {
        setSaving(false);
      }
    },
    [sessionId],
  );

  const settings = view?.settings ?? null;
  const enabled = settings?.notifyEnabled === true;
  const autoNotify = settings?.autoNotifyOnFinish === true;
  const selectedIds = settings?.notifyChannelIds ?? [];
  const available = view?.available ?? [];

  return (
    <Modal
      title={
        <Space>
          <BellOutlined />
          <span>渠道通知</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
    >
      {!sessionId ? (
        <Empty description="先发一条消息，创建会话后再设置通知" />
      ) : (
        <Spin spinning={loading}>
          <Space orientation="vertical" size={12} className="w-full">
            <div className="flex items-center justify-between">
              <div>
                <Text strong className="text-[13px]">
                  启用渠道通知
                </Text>
                <div>
                  <Text type="secondary" className="text-[11px]">
                    开启后我可以直接把结果发到你指定的渠道
                  </Text>
                </div>
              </div>
              <Switch
                checked={enabled}
                loading={saving}
                onChange={(checked) => void patch({ notifyEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Text strong className="text-[13px]">
                  每轮结束自动推送
                </Text>
                <div>
                  <Text type="secondary" className="text-[11px]">
                    由子智能体把最后一轮回复总结成通知发出去（不勾选渠道 = 全部已启用渠道）
                  </Text>
                </div>
              </div>
              <Switch
                checked={autoNotify}
                disabled={!enabled}
                loading={saving}
                onChange={(checked) => void patch({ autoNotifyOnFinish: checked })}
              />
            </div>

            <Divider className="!my-1" />

            <div>
              <Text strong className="text-[13px]">
                推送渠道
              </Text>
              {available.length === 0 ? (
                <Empty
                  className="my-3"
                  description="还没有已启用的渠道，先去「对话渠道」页面添加"
                />
              ) : (
                <Checkbox.Group
                  className="mt-2 flex flex-col gap-2"
                  value={selectedIds}
                  disabled={!enabled}
                  onChange={(values) => void patch({ notifyChannelIds: values as string[] })}
                >
                  {available.map((channel) => (
                    <Checkbox key={channel.id} value={channel.id} className="!ml-0">
                      <Space size={6}>
                        <span className="text-xs">{channel.name}</span>
                        <Tag className="text-[10px]">{channel.type}</Tag>
                        {!channel.bound ? (
                          <Tag color="warning" className="text-[10px]">
                            未绑定账号
                          </Tag>
                        ) : null}
                      </Space>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              )}
            </div>

            {settings?.notifiedAt ? (
              <Text type="secondary" className="text-[11px]">
                上次推送：{new Date(settings.notifiedAt).toLocaleString()}
              </Text>
            ) : null}

            <Alert
              type="info"
              showIcon
              title="微信 / QQ 需要你先在渠道里发过一条消息"
              description="这两家平台的主动推送必须带上入站消息里的会话凭证，没有的话平台会返回成功但消息被静默丢弃。发一条消息后就能正常接收通知。"
            />
          </Space>
        </Spin>
      )}
    </Modal>
  );
}
