import type { ThinkingLevel } from './types';

/**
 * reasoning_options 中的 effort 声明（结构兼容 ai_model.reasoning_options 与 models.dev）。
 * 只取用得到的字段，避免 llm-gateway 反向依赖 services 层类型。
 */
export interface ReasoningEffortOption {
  type: string;
  values?: readonly string[];
}

const ALL_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/** 模型未声明 effort 档位时的安全默认集（OpenAI reasoning_effort 枚举口径，不含 xhigh） */
const DEFAULT_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high'];

/**
 * 按模型端声明的思考能力推导可用档位——模型配置是唯一权威。
 * - 不支持思考：仅 off
 * - 未声明 effort：安全默认集
 * - 已声明 effort：off + 声明值（过滤掉非法值）
 */
export function allowedThinkingLevels(
  supportsThinking: boolean,
  reasoningOptions: readonly ReasoningEffortOption[] | null | undefined,
): ThinkingLevel[] {
  if (!supportsThinking) return ['off'];
  const values = reasoningOptions?.find((option) => option.type === 'effort')?.values;
  if (!values || values.length === 0) return [...DEFAULT_LEVELS];
  return [
    'off',
    ...values.filter(
      (value): value is ThinkingLevel =>
        value !== 'off' && ALL_LEVELS.includes(value as ThinkingLevel),
    ),
  ];
}
