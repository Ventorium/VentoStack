/**
 * 工具审批策略（纯逻辑）
 *
 * 把「运行模式 + 工具风险等级 + 审批子智能体判定结果」映射为最终动作，
 * 与 IO（LLM 调用、审批单落库、事件发射）解耦，便于单独测试。
 */
import type { RiskLevel } from './agent-engine/types';
import type { RunMode } from './llm-gateway/types';

/** 审批子智能体的系统提示词：只输出 JSON，从严判断 */
export const APPROVAL_JUDGE_PROMPT = [
  '你是工具调用审批员。根据工具名、风险等级与参数，判断这次调用是否可以自动放行。',
  '只输出 JSON，格式为 {"decision":"approve"|"reject","reason":"不超过 50 字的理由"}，不要输出其他内容。',
  '从严判断：参数涉及删除/覆盖数据、外发数据、访问工作区外路径、执行不可逆操作时，选择 reject。',
].join('\n');

export interface ApprovalVerdict {
  decision: 'approve' | 'reject';
  reason: string;
}

/** 审批决策动作 */
export type ApprovalAction =
  | { action: 'trust' }
  | { action: 'auto-approve'; reason: string }
  | { action: 'auto-reject'; reason: string }
  | { action: 'human' };

/**
 * 解析审批子智能体输出；任何不符合预期的输出都返回 null。
 * 调用方在拿到 null 时必须 fail-closed（转人工审批），绝不能因为"判不出来"而放行。
 *
 * 从**后往前**扫描所有 JSON 片段：模型（尤其是推理模型）常在思考里先起草一个结论再改口，
 * 取最后一段合法判定才贴合它的最终答复。
 */
export function parseApprovalVerdict(raw: string): ApprovalVerdict | null {
  const candidates = raw.match(/\{[^{}]*\}/g);
  if (!candidates) return null;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const decision = (parsed as Record<string, unknown>).decision;
    if (decision !== 'approve' && decision !== 'reject') continue;
    const rawReason = (parsed as Record<string, unknown>).reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 200) : '';
    return { decision, reason: reason || '（未给出理由）' };
  }
  return null;
}

/**
 * 审批决策：critical 工具无视运行模式，一律人工审批（强制底线）；
 * auto 模式下判定不可用（未配置模型 / 超时 / 输出非法）同样回落人工审批。
 */
export function resolveApprovalAction(params: {
  riskLevel: RiskLevel;
  runMode: RunMode;
  verdict: ApprovalVerdict | null;
}): ApprovalAction {
  if (params.riskLevel === 'critical') return { action: 'human' };
  if (params.runMode === 'trust') return { action: 'trust' };
  if (params.runMode === 'auto' && params.verdict) {
    return params.verdict.decision === 'approve'
      ? { action: 'auto-approve', reason: params.verdict.reason }
      : { action: 'auto-reject', reason: params.verdict.reason };
  }
  return { action: 'human' };
}
