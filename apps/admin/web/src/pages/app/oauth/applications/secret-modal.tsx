import type { OAuthApplicationSecret } from '@/api/types';
import { msg } from '@/components/GlobalMessage';
import { CopyOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Modal } from 'antd';
import copy from 'copy-to-clipboard';

export function SecretModal(props: {
  secret: OAuthApplicationSecret | null;
  onClose: () => void;
}) {
  const { secret, onClose } = props;
  return (
    <Modal
      title="请立即保存 Client Secret"
      open={!!secret}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          我已保存
        </Button>
      }
      closable={false}
      maskClosable={false}
    >
      <Alert
        type="warning"
        showIcon
        message="该 Secret 仅展示一次，关闭后无法再次查看。"
        className="mb-4"
      />
      {secret?.clientId && (
        <Input addonBefore="Client ID" value={secret.clientId} readOnly className="mb-3" />
      )}
      <Input.Password
        addonBefore="Secret"
        value={secret?.clientSecret}
        readOnly
        visibilityToggle
        suffix={
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={() => {
              if (secret) {
                copy(secret.clientSecret);
                msg.success('已复制');
              }
            }}
          />
        }
      />
    </Modal>
  );
}
