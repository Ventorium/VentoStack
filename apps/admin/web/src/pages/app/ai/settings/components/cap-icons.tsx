/**
 * AI 设置页 — 模型能力图标
 */
import {
  AudioOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Space, Tooltip } from "antd";
import type { ReactNode } from "react";
import type { ModelItem, ReasoningOption } from "../types";

export default function CapIcons({ model }: { model: ModelItem }) {
  const icons: ReactNode[] = [];
  if (model.supportsImage)
    icons.push(
      <Tooltip key="img" title="图片">
        <PictureOutlined className="text-[#1677ff]" />
      </Tooltip>,
    );
  if (model.supportsVideo)
    icons.push(
      <Tooltip key="vid" title="视频">
        <VideoCameraOutlined className="text-[#722ed1]" />
      </Tooltip>,
    );
  if (model.supportsAudio)
    icons.push(
      <Tooltip key="aud" title="语音">
        <AudioOutlined className="text-[#eb2f96]" />
      </Tooltip>,
    );
  if (model.supportsFunctionCalling)
    icons.push(
      <Tooltip key="fn" title="函数调用">
        <CodeOutlined className="text-[#52c41a]" />
      </Tooltip>,
    );
  if (model.supportsThinking) {
    const opts = model.reasoningOptions;
    let thinkTip = "推理/思考";
    if (opts && opts.length > 0) {
      const parts = opts.map((o: ReasoningOption) => {
        if (o.type === "toggle") return "开关";
        if (o.type === "effort") return `强度: ${o.values.join(", ")}`;
        return `预算: ${o.min ?? 0}~${o.max ?? "∞"}`;
      });
      thinkTip = `推理/思考 — ${parts.join(" + ")}`;
    }
    icons.push(
      <Tooltip key="think" title={thinkTip}>
        <ThunderboltOutlined className="text-[#fa8c16]" />
      </Tooltip>,
    );
  }
  if (model.supportsStructuredOutput)
    icons.push(
      <Tooltip key="struct" title="结构化输出">
        <CheckCircleOutlined className="text-[#13c2c2]" />
      </Tooltip>,
    );
  return <Space size={4}>{icons}</Space>;
}