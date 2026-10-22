/**
 * 账号绑定弹窗
 *
 * 为什么需要绑定：渠道消息进来时只知道「外部用户 id」，必须映射到平台用户，
 * 否则任何人都能借机器人烧你的额度。这里生成 6 位一次性验证码，用户在渠道内发
 * `/绑定 123456` 完成映射（5 分钟有效）。
 */
import { msg } from '@/components/GlobalMessage';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, List, Modal, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { fetchIdentities, issueBindCode, unbindIdentity } from '../api';
import type { BindCodeInfo, ChannelIdentity, ChannelItem } from '../types';

const { Text } = Typography;

interface BindModalProps {
  open: boolean;
  channel: ChannelItem | null;
  onClose: () => void;
}

export default function BindModal({ open, channel, onClose }: BindModalProps) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<BindCodeInfo | null>(null);
  const [identities, setIdentities] = useState<ChannelIdentity[]>([]);

  const loadIdentities = useCallback(async () => {
    if (!channel) return;
    const data = await fetchIdentities(channel.id);
    if (data) setIdentities(data.items ?? []);
  }, [channel]);

  const issueCode = useCallback(async () => {
    if (!channel) return;
    setLoading(true);
    try {
      const data = await issueBindCode(channel.id);
      if (data) setCode(data);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    if (!open || !channel) return;
    setCode(null);
    void loadIdentities();
    void issueCode();
  }, [open, channel, loadIdentities, issueCode]);

  const unbind = async (identityId: string) => {
    if (!channel) return;
    const result = await unbindIdentity(channel.id, identityId);
    if (result) {
      msg.success('已解绑');
      void loadIdentities();
    }
  };

  return (
    <Modal
      title={`「${channel?.name ?? ''}」账号绑定`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
    >
      <Space orientation="vertical" size={12} className="w-full">
        <Spin spinning={loading}>
          <div className="rounded-lg bg-black/3 p-4 text-center">
            {code ? (
              <>
                <Text type="secondary" className="text-xs">
                  在你的{channel?.name ?? '渠道'}里向机器人发送：
                </Text>
                <div className="my-2 font-mono text-3xl tracking-[0.4em]">{code.code}</div>
                <Text type="secondary" className="text-[11px]">
                  5 分钟内有效、仅可使用一次 · {new Date(code.expiresAt).toLocaleTimeString()} 过期
                </Text>
              </>
            ) : (
              <Text type="secondary" className="text-xs">
                正在生成验证码…
              </Text>
            )}
          </div>
        </Spin>

        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void issueCode()}>
            重新生成
          </Button>
        </Space>

        <Alert
          type="info"
          showIcon
          title="绑定后该账号才能对话"
          description="未绑定的消息只会收到一条绑定指引，不会进入 AI，也就不会消耗 token。"
        />

        <div>
          <Text strong className="text-xs">
            已绑定账号（{identities.length}）
          </Text>
          {identities.length === 0 ? (
            <Empty className="my-3" description="还没有绑定账号" />
          ) : (
            <List
              size="small"
              dataSource={identities}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="unbind"
                      title="解绑后该账号无法再对话"
                      onConfirm={() => void unbind(item.id)}
                    >
                      <Button size="small" danger type="text" icon={<DeleteOutlined />}>
                        解绑
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <Space>
                    <Text className="text-xs">{item.displayName ?? item.externalUserId}</Text>
                    <Tag className="text-[10px]">{item.externalUserId}</Tag>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>
      </Space>
    </Modal>
  );
}
