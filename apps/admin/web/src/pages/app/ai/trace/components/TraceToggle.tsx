/** 追踪开关：GET/PUT /api/ai/trace/config（权限 ai:trace:config，无权限时只读） */
import { useEffect, useState } from "react";
import { message, Space, Switch, Tooltip, Typography } from "antd";
import { client } from "@/api";

export default function TraceToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [writable, setWritable] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { error, data } = await client.get("/api/ai/trace/config");
      if (!alive) return;
      if (!error && data) setEnabled(Boolean((data as { enabled?: boolean }).enabled));
      // 403（无 config 权限）时保持开关只读展示
      setWritable(!error);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onChange = async (v: boolean) => {
    setLoading(true);
    const { error } = await client.put("/api/ai/trace/config", { body: { enabled: v } });
    setLoading(false);
    if (!error) {
      setEnabled(v);
      message.success(v ? "链路追踪已开启" : "链路追踪已关闭");
    } else {
      // 写失败回退为服务端真实状态
      const { data } = await client.get("/api/ai/trace/config");
      if (data) setEnabled(Boolean((data as { enabled?: boolean }).enabled));
    }
  };

  return (
    <Space size={8}>
      <Typography.Text type="secondary">追踪开关</Typography.Text>
      <Tooltip title={writable ? "关闭后新对话不再记录链路" : "无配置权限（ai:trace:config）"}>
        <Switch size="small" checked={enabled} loading={loading} disabled={!writable} onChange={onChange} />
      </Tooltip>
    </Space>
  );
}
