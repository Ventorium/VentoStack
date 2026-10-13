/**
 * 上下文统计 — 会话级计数总览
 *
 * 对齐 dsh-context 顶部「上下文统计」面板的信息密度，只保留服务端真实上报的字段：
 *  - 会话进度：轮次 / 步数 / 模型回复 / 技能加载（session.counts）
 *  - 输入输出：用户输入 / 读取 / 写入 / 搜索 / 图片
 *  - 上下文事件：注入 / 压缩 / 裁剪（会改变上下文规模的动作）
 *  - 累计用量：输入 / 缓存读 / 缓存写 / 输出（提供方上报口径）
 *
 * 刻意不展示的：逐工具调用次数、Agent 子网络 —— 采集里没有这两个维度，
 * 宁可不显示，也不用其它数字凑一个看起来像的。
 */
import { Card, Tooltip, Typography, theme } from "antd";
import type { ContextDetail } from "./context-detail-types";

interface Chip {
  label: string;
  value: string;
  /** 值为 0 时弱化显示（读者一眼跳过） */
  zero?: boolean;
  tip?: string;
}

interface Group {
  title: string;
  chips: Chip[];
}

interface SessionOverviewProps {
  detail?: ContextDetail;
}

export default function SessionOverview({ detail }: SessionOverviewProps) {
  const { token } = theme.useToken();
  const session = detail?.session;
  const counts = session?.counts ?? {};
  const usage = session?.usage ?? {};

  const n = (key: string) => counts[key] ?? 0;
  const u = (key: string) => usage[key] ?? 0;

  const nodes = [...(detail?.nodes ?? []), ...(detail?.archive ?? [])];
  const images = nodes.reduce((s, x) => s + (x.images ?? 0), 0);
  const byKind = (kind: string) => (detail?.fileOps ?? []).filter((f) => f.kind === kind).length;
  // 助手消息条数按节点真实计数：会话行上的 answers 计数器不随消息事件维护（恒为 0），
  // 直接用它会与「组成占比 · 助手回复」自相矛盾。
  const assistantCount = nodes.filter((x) => x.category === "assistant").length;

  const fmt = (v: number) => v.toLocaleString();
  const chip = (label: string, value: number, tip?: string): Chip => ({
    label,
    value: fmt(value),
    zero: value === 0,
    ...(tip !== undefined ? { tip } : {}),
  });

  const groups: Group[] = [
    {
      title: "会话进度",
      chips: [
        chip("轮次", n("turns"), "用户发起的对话轮数"),
        chip("步数", n("steps"), "run 内推进的步数（一次 run 可能多步）"),
        chip("助手消息", assistantCount, "上下文中的助手消息条数（含历史重放）"),
        chip("技能加载", n("skills"), "本次会话加载的技能数"),
      ],
    },
    {
      title: "输入输出",
      chips: [
        chip("用户输入", n("humanInputs"), "用户消息条数（含历史重放）"),
        chip("读取", byKind("read"), "文件读取类工具命中次数"),
        chip("写入", byKind("write"), "文件写入类工具命中次数"),
        chip("搜索", byKind("search"), "搜索类工具命中次数"),
        chip("图片", images, "上下文里携带的图片数量"),
      ],
    },
    {
      title: "上下文事件",
      chips: [
        chip("注入", n("injects"), "运行中注入的上下文（工具 schema 等）"),
        chip("压缩", n("compactions"), "摘要替换历史消息的次数"),
        chip("裁剪", n("prunes"), "裁剪旧节点的次数"),
      ],
    },
    {
      title: "累计用量",
      chips: [
        chip("输入", u("uncached"), "提供方上报的未命中缓存输入 tokens"),
        chip("缓存读", u("cacheRead"), "命中缓存的输入 tokens"),
        chip("缓存写", u("cacheWrite"), "写入缓存的 tokens"),
        chip("输出", u("output"), "模型输出 tokens"),
      ],
    },
  ];

  return (
    <Card size="small" title="上下文统计">
      <div className="flex flex-col gap-2.5">
        {groups.map((g) => (
          <div key={g.title} className="flex items-start gap-3">
            <span
              className="w-16 shrink-0 pt-0.5 text-xs"
              style={{ color: token.colorTextTertiary }}
            >
              {g.title}
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {g.chips.map((c) => {
                const body = (
                  <span
                    className="inline-flex items-baseline gap-1.5 rounded px-2 py-0.5 text-xs"
                    style={{ background: token.colorFillQuaternary }}
                  >
                    <span style={{ color: token.colorTextTertiary }}>{c.label}</span>
                    <span
                      className="font-medium"
                      style={{ color: c.zero ? token.colorTextQuaternary : token.colorText }}
                    >
                      {c.value}
                    </span>
                  </span>
                );
                return c.tip ? (
                  <Tooltip key={c.label} title={c.tip} mouseEnterDelay={0.15}>
                    {body}
                  </Tooltip>
                ) : (
                  <span key={c.label}>{body}</span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {session?.lastUser ? (
        <Typography.Text
          type="secondary"
          className="mt-2.5 block truncate text-xs"
          title={session.lastUser}
        >
          最近输入：{session.lastUser}
        </Typography.Text>
      ) : null}
    </Card>
  );
}
