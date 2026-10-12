/**
 * 分桶口径说明
 *
 * 「组成占比」的七个分桶各自代表什么、token 是怎么算出来的 —— 放在占比卡片旁边，
 * 让「数字可信」这件事本身可核对（估算值 vs 提供方上报值的区别也写在这里）。
 *
 * 主题：全部走 antd token，深浅色一致。
 */
import { Card, Typography, theme } from "antd";
import { CATEGORY_ORDER, CATEGORY_STYLE } from "./category-style";

/** 七个分桶的含义（顺序与 CATEGORY_ORDER 一致） */
const MEANING: Record<string, string> = {
  system: "系统提示全文，每轮请求都带",
  tools: "工具的 name / description / parameters 定义",
  user: "用户消息（含历史重放）",
  inject: "运行中注入的上下文（工具结果引入新工具等）",
  skill: "被识别为技能内容的片段",
  assistant: "助手回复（含工具调用指令）",
  tool: "工具执行结果",
};

export default function CompositionLegend() {
  const { token } = theme.useToken();

  return (
    <Card size="small" className="mt-3" title="口径说明">
      <div className="flex flex-col gap-1.5">
        {CATEGORY_ORDER.map((key) => (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-sm"
              style={{ background: CATEGORY_STYLE[key]?.color ?? token.colorTextTertiary }}
            />
            <span className="w-20 shrink-0" style={{ color: token.colorTextSecondary }}>
              {CATEGORY_STYLE[key]?.label ?? key}
            </span>
            <span style={{ color: token.colorTextTertiary }}>{MEANING[key] ?? "-"}</span>
          </div>
        ))}
      </div>
      <Typography.Paragraph
        type="secondary"
        className="!mb-0 mt-3 !text-xs"
        style={{ color: token.colorTextTertiary }}
      >
        占比按 ~4 字符 ≈ 1 token 的固定密度估算（与参考实现同规则），
        与「计费 tokens」的提供方上报值口径不同，两者不混算。
        每个 run 都会重放整段历史，旧节点归档后不计入当前装配。
      </Typography.Paragraph>
    </Card>
  );
}
