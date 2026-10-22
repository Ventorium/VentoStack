/**
 * 选择渠道类型
 *
 * 目录卡片墙：按分组（即时通讯 / 办公协作 / IoT）排列，
 * 非官方渠道打风险标，需要公网地址的提前说明，避免用户配到一半才发现条件不满足。
 */
import { AlertOutlined, MessageOutlined, WifiOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Empty, Modal, Row, Space, Tag, Typography } from 'antd';
import type { ChannelCatalogEntry, ChannelTransport } from '../types';
import { CATEGORY_LABEL, TRANSPORT_LABEL } from '../types';

const { Text, Paragraph } = Typography;

const CATEGORY_ORDER: Array<'im' | 'office' | 'iot'> = ['im', 'office', 'iot'];

const CATEGORY_ICON = {
  im: <MessageOutlined />,
  office: <AlertOutlined />,
  iot: <WifiOutlined />,
};

interface AddChannelModalProps {
  open: boolean;
  catalog: ChannelCatalogEntry[];
  /** 是否已配置公网地址；未配置时 webhook 类渠道给出提示 */
  publicBaseUrl: string | null;
  onClose: () => void;
  onPick: (entry: ChannelCatalogEntry) => void;
}

function transportTag(transport: ChannelTransport) {
  const color = transport === 'webhook' ? 'blue' : transport === 'polling' ? 'purple' : 'cyan';
  return (
    <Tag color={color} className="text-[10px]">
      {TRANSPORT_LABEL[transport]}
    </Tag>
  );
}

export default function AddChannelModal({
  open,
  catalog,
  publicBaseUrl,
  onClose,
  onPick,
}: AddChannelModalProps) {
  return (
    <Modal
      title="添加对话渠道"
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
    >
      {!publicBaseUrl ? (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          title="未配置公网地址（AI_CHANNEL_PUBLIC_BASE_URL）"
          description="飞书 / 企业微信 / QQ / 钉钉 需要把回调地址填到平台后台，没有公网地址时这几类渠道收不到消息；微信与 MQTT 不受影响。"
        />
      ) : null}

      {catalog.length === 0 ? (
        <Empty description="没有可用的渠道类型" />
      ) : (
        CATEGORY_ORDER.map((category) => {
          const items = catalog.filter((entry) => entry.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="mb-4">
              <Space size={6} className="mb-2">
                <span className="opacity-60">{CATEGORY_ICON[category]}</span>
                <Text strong className="text-xs">
                  {CATEGORY_LABEL[category] ?? category}
                </Text>
              </Space>
              <Row gutter={[12, 12]}>
                {items.map((entry) => (
                  <Col span={8} key={entry.type}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => onPick(entry)}
                      className="h-full cursor-pointer"
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <Text strong className="truncate text-[13px]">
                          {entry.name}
                        </Text>
                        {transportTag(entry.transport)}
                      </div>
                      <Paragraph
                        type="secondary"
                        className="mb-1 text-[11px] leading-4"
                        ellipsis={{ rows: 2 }}
                      >
                        {entry.description}
                      </Paragraph>
                      <Space size={4} wrap>
                        {!entry.official ? (
                          <Tag color="warning" className="text-[10px]">
                            非官方
                          </Tag>
                        ) : null}
                        {entry.requiresLogin ? (
                          <Tag color="geekblue" className="text-[10px]">
                            扫码登录
                          </Tag>
                        ) : null}
                        {entry.requiresPublicUrl && !publicBaseUrl ? (
                          <Tag color="red" className="text-[10px]">
                            需公网地址
                          </Tag>
                        ) : null}
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          );
        })
      )}
    </Modal>
  );
}
