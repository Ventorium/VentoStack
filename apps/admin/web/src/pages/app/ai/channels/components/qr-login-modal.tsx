/**
 * 扫码登录弹窗（仅 weixin-ilink）
 *
 * 为什么必须「可重复进入」而不是一次性配置：官方插件约 24 小时过期、
 * 每次扫码机器人 id 都会变，所以入口要常驻，过期后重新扫即可。
 *
 * 两个必须遵守的细节（都踩过坑）：
 *   1. 后端给的 `qrcodeContent` 是**二维码里要编码的内容**（liteapp 落地页 URL），
 *      不是图片。直接塞 `<img src>` 会拿到 text/html，二维码永远显示不出来，
 *      所以这里用 antd `QRCode` 自己渲染；只有真拿到 data URL / 图片地址时才用 `<img>`。
 *   2. 状态查询是长轮询，服务端一次最多挂 6 秒。轮询必须**串行**（上一次回来再排下一次），
 *      否则请求会叠在一起。
 */
import { msg } from '@/components/GlobalMessage';
import { Alert, Button, Input, Modal, QRCode, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { beginQrLogin, pollQrLogin, submitQrVerifyCode } from '../api';
import type { ChannelItem, QrBeginResult, QrStatus } from '../types';

const { Text } = Typography;

const POLL_INTERVAL_MS = 2000;

const STATUS_TEXT: Record<QrStatus, string> = {
  wait: '请用微信扫一扫',
  scaned: '已扫码，请在手机上确认',
  confirmed: '登录成功',
  expired: '二维码已过期，请重新获取',
  need_verifycode: '需要在手机上输入验证码',
  blocked: '验证码错误次数过多，请重新获取二维码',
};

interface QrLoginModalProps {
  open: boolean;
  channel: ChannelItem | null;
  onClose: () => void;
  onConfirmed: () => void;
}

/** 只有这些形态才是「可以直接当图片用」的内容；其余都按二维码内容处理 */
function isImageContent(content: string): boolean {
  return content.startsWith('data:image/');
}

export default function QrLoginModal({ open, channel, onClose, onConfirmed }: QrLoginModalProps) {
  const channelId = channel?.id ?? null;
  const [qr, setQr] = useState<QrBeginResult | null>(null);
  const [status, setStatus] = useState<QrStatus>('wait');
  const [detail, setDetail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const stopPolling = useCallback(() => {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(
    async (id: string, qrcode: string) => {
      if (stopped.current) return;
      const data = await pollQrLogin(id, qrcode);
      if (stopped.current) return;
      // 单次失败（网络抖动、服务端超时）不弹错，继续问即可
      if (!data) {
        timer.current = setTimeout(() => void poll(id, qrcode), POLL_INTERVAL_MS);
        return;
      }
      setStatus(data.status);
      setDetail(data.detail ?? null);

      if (data.status === 'confirmed') {
        msg.success('微信已登录，渠道已自动启用');
        stopPolling();
        onConfirmed();
        return;
      }
      if (data.status === 'expired' || data.status === 'blocked') {
        stopPolling();
        return;
      }
      timer.current = setTimeout(() => void poll(id, qrcode), POLL_INTERVAL_MS);
    },
    [onConfirmed, stopPolling],
  );

  const begin = useCallback(async () => {
    if (!channelId) return;
    stopPolling();
    stopped.current = false;
    setLoading(true);
    setDetail(null);
    setVerifyCode('');
    setStatus('wait');
    try {
      const result = await beginQrLogin(channelId);
      if (!result) return;
      setQr(result);
      timer.current = setTimeout(() => void poll(channelId, result.qrcode), POLL_INTERVAL_MS);
    } finally {
      setLoading(false);
    }
  }, [channelId, poll, stopPolling]);

  // 依赖只用 open + 渠道 id：父组件刷新列表会产生新的 channel 对象，
  // 若依赖对象本身会导致每次刷新都重新要一张二维码、把轮询打乱。
  useEffect(() => {
    if (!open || !channelId) return;
    void begin();
    return () => stopPolling();
  }, [open, channelId, begin, stopPolling]);

  useEffect(() => {
    if (!open) return;
    setQr(null);
    setStatus('wait');
    setDetail(null);
  }, [open]);

  const submitVerifyCode = async () => {
    if (!channelId || !qr || !verifyCode.trim()) return;
    const next = await submitQrVerifyCode(channelId, qr.qrcode, verifyCode.trim());
    if (!next) return;
    setStatus(next.status);
    setDetail(next.detail ?? null);
    if (next.status === 'confirmed') {
      msg.success('微信已登录');
      stopPolling();
      onConfirmed();
    }
  };

  return (
    <Modal
      title="微信扫码登录"
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      destroyOnHidden
    >
      <Space orientation="vertical" size={12} className="w-full" align="center">
        <Spin spinning={loading}>
          {qr ? (
            isImageContent(qr.qrcodeContent) ? (
              <img
                src={qr.qrcodeContent}
                alt="微信登录二维码"
                className="h-[220px] w-[220px] rounded border border-solid border-black/10 object-contain"
              />
            ) : (
              <div className="rounded border border-solid border-black/10 bg-white p-2">
                <QRCode value={qr.qrcodeContent} size={204} bordered={false} />
              </div>
            )
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded bg-black/3">
              <Text type="secondary" className="text-xs">
                正在获取二维码…
              </Text>
            </div>
          )}
        </Spin>

        <Text className="text-xs">{STATUS_TEXT[status]}</Text>
        {detail ? (
          <Text type="secondary" className="text-[11px]">
            {detail}
          </Text>
        ) : null}

        {status === 'need_verifycode' ? (
          <Space.Compact className="w-full">
            <Input
              placeholder="手机收到的验证码"
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value)}
              onPressEnter={() => void submitVerifyCode()}
            />
            <Button type="primary" onClick={() => void submitVerifyCode()}>
              提交
            </Button>
          </Space.Compact>
        ) : null}

        <Button size="small" onClick={() => void begin()}>
          重新获取二维码
        </Button>

        <Alert
          type="warning"
          showIcon
          className="w-full"
          title="约 24 小时需重新扫码"
          description="官方插件的登录态会过期，且每次登录机器人 ID 会变化；过期后回到本页重新扫码即可，历史会话不受影响。"
        />
      </Space>
    </Modal>
  );
}
