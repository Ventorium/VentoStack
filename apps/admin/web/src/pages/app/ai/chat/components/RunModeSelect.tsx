import { SafetyCertificateOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Modal, Popover, Typography, theme } from 'antd';

const { Text } = Typography;

/** Agent 运行模式（审批策略）：与后端 RunMode 对齐 */
export type RunMode = 'ask' | 'auto' | 'trust';

interface RunModeMeta {
  label: string;
  short: string;
  description: string;
  icon: React.ReactNode;
  /** 触发按钮配色：ask 中性，auto 警告，trust 危险 */
  tone: 'neutral' | 'warning' | 'danger';
  /** 切换到该模式时的风险提示；缺省表示无需确认 */
  risk?: { title: string; detail: string };
}

const RUN_MODE_META: Record<RunMode, RunModeMeta> = {
  ask: {
    label: '需要审批',
    short: '需审批',
    description: '高风险工具会挂起，等你确认后再执行',
    icon: <SafetyCertificateOutlined />,
    tone: 'neutral',
  },
  auto: {
    label: '自动审批',
    short: '自动审批',
    description: '由审批子智能体判定放行或拒绝',
    icon: <ThunderboltOutlined />,
    tone: 'warning',
    risk: {
      title: '开启自动审批？',
      detail:
        '高风险工具将由审批子智能体自动判定，不再逐次询问你。模型可能误判而放行不该执行的操作。' +
        'critical 风险工具（如任意命令、任意 SQL、MCP 工具）仍会弹窗由你确认。',
    },
  },
  trust: {
    label: '信任模型',
    short: '信任',
    description: '跳过审批，直接执行',
    icon: <WarningOutlined />,
    tone: 'danger',
    risk: {
      title: '开启信任模式？',
      detail:
        '模型将无需你的确认即可执行高风险操作（写文件、调用工具等），存在不可逆风险。' +
        'critical 风险工具（如任意命令、任意 SQL、MCP 工具）仍会弹窗由你确认。',
    },
  },
};

const RUN_MODE_ORDER: RunMode[] = ['ask', 'auto', 'trust'];

export default function RunModeSelect({
  value,
  onChange,
  disabled,
}: {
  value: RunMode;
  onChange?: (mode: RunMode) => void;
  disabled?: boolean;
}) {
  const { token } = theme.useToken();
  const meta = RUN_MODE_META[value];

  const toneColor = (tone: RunModeMeta['tone']): string =>
    tone === 'danger'
      ? token.colorError
      : tone === 'warning'
        ? token.colorWarning
        : token.colorTextSecondary;

  const apply = (mode: RunMode) => {
    if (mode === value) return;
    const risk = RUN_MODE_META[mode].risk;
    if (!risk) {
      onChange?.(mode);
      return;
    }
    // 提升审批宽松度属于有风险操作：必须显式确认后才生效
    Modal.confirm({
      title: risk.title,
      okText: '确认开启',
      okButtonProps: { danger: mode === 'trust' },
      cancelText: '取消',
      content: <Text className="text-[13px]">{risk.detail}</Text>,
      onOk: () => onChange?.(mode),
    });
  };

  return (
    <Popover
      trigger="click"
      placement="topRight"
      content={
        <div className="w-72 p-1">
          <div className="px-2 py-1 text-xs" style={{ color: token.colorTextSecondary }}>
            运行模式
          </div>
          {RUN_MODE_ORDER.map((mode) => {
            const item = RUN_MODE_META[mode];
            const active = mode === value;
            return (
              <Button
                key={mode}
                type="text"
                block
                className="h-auto py-2 rounded-lg text-left"
                onClick={() => apply(mode)}
              >
                <span className="flex items-start gap-2 w-full">
                  <span className="shrink-0 pt-0.5" style={{ color: toneColor(item.tone) }}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="flex items-center gap-1 text-sm"
                      style={{ color: active ? token.colorPrimary : undefined }}
                    >
                      {item.label}
                      {active && <span>✓</span>}
                    </span>
                    <span className="block text-xs" style={{ color: token.colorTextTertiary }}>
                      {item.description}
                    </span>
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      }
    >
      <Button
        type="text"
        aria-label="运行模式"
        disabled={disabled}
        className="max-w-[220px] rounded-full px-3"
        style={{ background: value === 'ask' ? token.colorFillSecondary : undefined }}
      >
        <span className="flex items-center gap-1.5">
          <span className="shrink-0" style={{ color: toneColor(meta.tone) }}>
            {meta.icon}
          </span>
          {/* 非默认档位时标签常显，避免"静默高信任" */}
          <span
            className="truncate text-xs"
            style={{ color: value === 'ask' ? token.colorTextSecondary : toneColor(meta.tone) }}
          >
            {meta.short}
          </span>
        </span>
      </Button>
    </Popover>
  );
}
