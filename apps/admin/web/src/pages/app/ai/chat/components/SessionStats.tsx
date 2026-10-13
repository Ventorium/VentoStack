/**
 * 会话统计卡
 *
 * 口径说明（都能在页面里逐行核对，悬停卡片可看）：
 *  - 模型请求：实际落库的请求快照条数（不采信会话上会被逐 run 覆盖的 step_count）
 *  - 计费 tokens：Σ 各请求「提供方上报」的真实用量；未上报的请求显示 -、不计入
 *  - 耗时：Σ 每次 run 的墙钟耗时（closeSession 累加），不含两轮之间的空闲
 *  - 运行次数：会话内 run 数（多轮对话 = 同一会话多个 run）
 *
 * 会话元信息（标题/状态/模型/提供方/窗口/开始时间）不在这里展示：
 * 首页顶部已经有会话与模型信息，这里只保留「数字」本身。
 */
import { Card, Col, Row, Statistic, Tooltip, theme } from "antd";
import {
  ApiOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { ContextDetailSession } from "./context-detail-types";

interface SessionStatsProps {
  session?: ContextDetailSession;
  /** 实际请求快照条数 */
  requestCount: number;
}

export default function SessionStats({ session, requestCount }: SessionStatsProps) {
  const { token } = theme.useToken();
  const billed =
    (session?.usage?.uncached ?? 0) +
    (session?.usage?.cacheRead ?? 0) +
    (session?.usage?.cacheWrite ?? 0) +
    (session?.usage?.output ?? 0);

  const cards = [
    {
      key: "requests",
      title: "模型请求",
      value: requestCount,
      icon: <ApiOutlined />,
      color: token.colorPrimary,
      tip: "实际落库的请求快照条数（一次 run 可能包含多次模型请求）",
    },
    {
      key: "billed",
      title: "计费 tokens",
      value: billed,
      icon: <ThunderboltOutlined />,
      color: "#fa8c16",
      tip: "各请求「提供方上报」的输入+输出之和；未上报的请求不计入（列表里显示 -）",
    },
    {
      key: "duration",
      title: "耗时",
      value: session?.durationMs ?? 0,
      icon: <ClockCircleOutlined />,
      color: "#52c41a",
      tip: "各次 run 的墙钟耗时之和，不含两轮之间的空闲时间",
      suffix: "ms",
    },
    {
      key: "runs",
      title: "运行次数",
      value: session?.runCount ?? 0,
      icon: <DatabaseOutlined />,
      color: "#722ed1",
      tip: "会话内的 run 数：同一会话多轮对话会产生多个 run，每轮都会重放整段上下文",
    },
  ];

  return (
    <Row gutter={[12, 12]}>
      {cards.map((c) => (
        <Col span={12} key={c.key}>
          <Tooltip title={c.tip}>
            <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
              <Statistic
                title={<span className="text-xs">{c.title}</span>}
                value={c.value}
                {...(c.suffix ? { suffix: c.suffix } : {})}
                formatter={(v) => Number(v ?? 0).toLocaleString()}
                prefix={
                  <span className="text-base" style={{ color: c.color }}>
                    {c.icon}
                  </span>
                }
                styles={{ content: { fontSize: 22 } }}
              />
            </Card>
          </Tooltip>
        </Col>
      ))}
    </Row>
  );
}
