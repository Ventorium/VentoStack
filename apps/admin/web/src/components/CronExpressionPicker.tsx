import { ClockCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Input, InputNumber, Popover, Segmented, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';

type CronMode = 'minute' | 'minutes' | 'hour' | 'hours' | 'day';

export interface CronExpressionPickerProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export function buildCronExpression(mode: CronMode, interval: number): string {
  const safeInterval = Math.max(1, Math.floor(interval));
  if (mode === 'minute') return '* * * * *';
  if (mode === 'minutes') return `*/${Math.min(59, safeInterval)} * * * *`;
  if (mode === 'hour') return '0 * * * *';
  if (mode === 'hours') return `0 */${Math.min(23, safeInterval)} * * *`;
  return '0 0 * * *';
}

export function isSupportedCronExpression(value: string): boolean {
  const cron = value.trim();
  if (cron === '* * * * *' || cron === '0 * * * *' || cron === '0 0 * * *') return true;
  const minutes = cron.match(/^\*\/(\d{1,2}) \* \* \* \*$/);
  if (minutes) {
    const interval = Number(minutes[1]);
    return interval >= 1 && interval <= 59;
  }
  const hours = cron.match(/^0 \*\/(\d{1,2}) \* \* \*$/);
  if (hours) {
    const interval = Number(hours[1]);
    return interval >= 1 && interval <= 23;
  }
  return false;
}

export function describeCronExpression(value: string): string {
  const cron = value.trim();
  if (cron === '* * * * *') return '每分钟执行一次';
  if (cron === '0 * * * *') return '每小时执行一次';
  if (cron === '0 0 * * *') return '每 24 小时执行一次';
  const minutes = cron.match(/^\*\/(\d{1,2}) /);
  if (minutes) return `每 ${Number(minutes[1])} 分钟执行一次`;
  const hours = cron.match(/^0 \*\/(\d{1,2}) /);
  if (hours) return `每 ${Number(hours[1])} 小时执行一次`;
  return '当前调度引擎不支持此表达式';
}

function parseCronExpression(value: string | undefined): { mode: CronMode; interval: number } {
  if (value === '* * * * *') return { mode: 'minute', interval: 1 };
  if (value === '0 * * * *') return { mode: 'hour', interval: 1 };
  if (value === '0 0 * * *') return { mode: 'day', interval: 1 };
  const minutes = value?.match(/^\*\/(\d{1,2}) \* \* \* \*$/);
  if (minutes) return { mode: 'minutes', interval: Number(minutes[1]) };
  const hours = value?.match(/^0 \*\/(\d{1,2}) \* \* \*$/);
  if (hours) return { mode: 'hours', interval: Number(hours[1]) };
  return { mode: 'minutes', interval: 5 };
}

const modeOptions: Array<{ label: string; value: CronMode }> = [
  { label: '每分钟', value: 'minute' },
  { label: '按分钟', value: 'minutes' },
  { label: '每小时', value: 'hour' },
  { label: '按小时', value: 'hours' },
  { label: '每24小时', value: 'day' },
];

export function CronExpressionPicker({ value, onChange, disabled }: CronExpressionPickerProps) {
  const parsed = parseCronExpression(value);
  const [mode, setMode] = useState<CronMode>(parsed.mode);
  const [interval, setIntervalValue] = useState(parsed.interval);

  useEffect(() => {
    const next = parseCronExpression(value);
    setMode(next.mode);
    setIntervalValue(next.interval);
  }, [value]);

  const commit = (nextMode: CronMode, nextInterval: number) => {
    setMode(nextMode);
    setIntervalValue(nextInterval);
    onChange?.(buildCronExpression(nextMode, nextInterval));
  };

  const content = (
    <div className="w-96 max-w-[calc(100vw-3rem)]">
      <Typography.Text strong>执行频率</Typography.Text>
      <div className="mt-3">
        <Segmented
          block
          options={modeOptions}
          value={mode}
          onChange={(nextMode) => commit(nextMode, interval)}
        />
      </div>
      {(mode === 'minutes' || mode === 'hours') && (
        <div className="mt-4 flex items-center gap-2">
          <Typography.Text type="secondary">每</Typography.Text>
          <InputNumber
            min={1}
            max={mode === 'minutes' ? 59 : 23}
            value={interval}
            onChange={(next) => commit(mode, next ?? 1)}
          />
          <Typography.Text type="secondary">
            {mode === 'minutes' ? '分钟' : '小时'}执行一次
          </Typography.Text>
        </div>
      )}
      <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800">
        <div className="text-xs text-gray-500 dark:text-gray-400">生成结果</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <Typography.Text code>{buildCronExpression(mode, interval)}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {describeCronExpression(buildCronExpression(mode, interval))}
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  return (
    <Space.Compact className="w-full">
      <Input value={value} readOnly prefix={<ClockCircleOutlined />} placeholder="请配置执行频率" />
      <Popover content={content} trigger="click" placement="bottomRight">
        <Button icon={<SettingOutlined />} disabled={disabled}>
          配置
        </Button>
      </Popover>
    </Space.Compact>
  );
}

export default CronExpressionPicker;
