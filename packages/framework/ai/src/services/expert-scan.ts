/**
 * 专家安全扫描 — 安装/升级强制执行，fail-closed
 *
 * 专家 prompt 是不可信输入：入库前必须通过本扫描。
 * 规则零第三方依赖，可复用/对齐 agent-engine/prompt-guard 的检测面。
 */

import type { HubExpertMeta } from './expert-hub';

const SCANNER_VERSION = '1.0.0';

/** prompt 正文长度上限（与 hub 客户端一致） */
export const MAX_PROMPT_LENGTH = 128 * 1024;

// ---- Types ----

export interface ScanFinding {
  /** 规则标识，如 pseudo_system_tag */
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
}

export interface ScanResult {
  status: 'passed' | 'failed';
  findings: ScanFinding[];
  scannerVersion: string;
  scannedAt: string;
}

export type ExpertScanner = (meta: HubExpertMeta, prompt: string) => ScanResult;

// ---- 规则 ----

interface PromptRule {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
  test: (prompt: string) => boolean;
}

/** 注入/越权/隐藏内容规则：命中 critical 即 fail-closed */
const PROMPT_RULES: PromptRule[] = [
  {
    rule: 'pseudo_system_tag',
    severity: 'critical',
    message: '包含与运行时注入模板冲突的伪 system/user/assistant/expert_definition 标签',
    test: (p) =>
      /<\s*\/?\s*(system|user|assistant|expert_definition|available_skills|content_policy)\b/i.test(
        p,
      ),
  },
  {
    rule: 'override_instruction',
    severity: 'critical',
    message: '包含越权指令（忽略/覆盖既有系统指令类表述）',
    test: (p) => {
      const lower = p.toLowerCase();
      return (
        /忽略(之前|以上|先前|前面)(的)?(所有)?(指令|提示|设定|规则)/.test(p) ||
        /无视(之前|以上|先前|系统)(的)?(所有)?(指令|提示|设定|规则)/.test(p) ||
        /覆盖(系统|原有|之前)(提示|指令|人设|设定)/.test(p) ||
        /disregard\s+(all\s+)?(previous|prior|above)/.test(lower) ||
        /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/.test(lower) ||
        /override\s+(the\s+)?(system\s+)?(prompt|instructions)/.test(lower)
      );
    },
  },
  {
    rule: 'disable_safety',
    severity: 'critical',
    message: '试图禁用/绕过安全策略、审计或审批机制',
    test: (p) => {
      const lower = p.toLowerCase();
      return (
        /(禁用|关闭|绕过|跳过)(内容安全|安全策略|安全审查|审计|审批|权限校验)/.test(p) ||
        /disable\s+(safety|content\s+polic\w*|guardrails|auditing|approval)/.test(lower) ||
        /bypass\s+(safety|security|permission|audit)/.test(lower)
      );
    },
  },
  {
    rule: 'hidden_content',
    severity: 'critical',
    message: '包含零宽字符/不可见 Unicode 等隐藏内容',
    test: (p) => /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/.test(p),
  },
  {
    rule: 'script_tag',
    severity: 'critical',
    message: '包含可执行脚本标签（<script 等）',
    test: (p) => /<\s*script\b/i.test(p) || /<\s*iframe\b/i.test(p),
  },
  {
    rule: 'secret_pattern',
    severity: 'critical',
    message: '疑似真实密钥/凭据',
    test: (p) =>
      /sk-[A-Za-z0-9]{20,}/.test(p) ||
      /AKIA[0-9A-Z]{16}/.test(p) ||
      /ghp_[A-Za-z0-9]{30,}/.test(p) ||
      /-----BEGIN\s+[A-Z ]*PRIVATE KEY-----/.test(p) ||
      /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(p),
  },
  {
    rule: 'exfiltration_instruction',
    severity: 'warning',
    message: '包含诱导外发用户数据的指令模式（人工复核）',
    test: (p) =>
      /(上传|发送|外发|提交)(.{0,30})(用户|会话|对话|私密|敏感)?(数据|内容|文件|记录)(.{0,20})(到|至|to)\s*(外部|第三方|https?:)/.test(
        p,
      ) ||
      /(用户|会话|对话|私密|敏感)(数据|内容|文件|记录|信息)(.{0,10})(上传|发送|外发|提交)(.{0,20})(到|至|to)\s*(外部|第三方|https?:)/.test(
        p,
      ) ||
      /(curl|fetch|http\.post|requests\.post)(.{0,40})(用户|会话|对话)?(数据|内容)/i.test(p),
  },
  {
    rule: 'long_base64_block',
    severity: 'warning',
    message: '包含长 base64 块（人工复核是否为隐藏指令）',
    test: (p) => /[A-Za-z0-9+/]{200,}={0,2}/.test(p),
  },
];

// ---- 扫描入口 ----

/**
 * 扫描专家：结构校验 + 注入特征 + 敏感信息 + 工具声明。
 * 任意 critical 命中 → failed（fail-closed）；warning 仅记录。
 */
export function scanExpert(
  meta: HubExpertMeta,
  prompt: string,
  options?: { knownTools?: ReadonlySet<string> },
): ScanResult {
  const findings: ScanFinding[] = [];

  // 结构：长度上限
  if (prompt.length > MAX_PROMPT_LENGTH) {
    findings.push({
      rule: 'prompt_too_large',
      severity: 'critical',
      message: `prompt 超限（${prompt.length} > ${MAX_PROMPT_LENGTH} 字符）`,
    });
  }
  if (prompt.trim().length === 0) {
    findings.push({
      rule: 'prompt_empty',
      severity: 'critical',
      message: 'prompt 正文为空',
    });
  }

  // 内容规则
  for (const rule of PROMPT_RULES) {
    if (rule.test(prompt)) {
      findings.push({ rule: rule.rule, severity: rule.severity, message: rule.message });
    }
  }

  // 工具声明：白名单比对
  if (options?.knownTools && meta.suggestedTools) {
    for (const tool of meta.suggestedTools) {
      if (!options.knownTools.has(tool)) {
        findings.push({
          rule: 'unknown_suggested_tool',
          severity: 'warning',
          message: `建议工具未在平台注册，将剔除：${tool}`,
        });
      }
    }
  }

  const failed = findings.some((f) => f.severity === 'critical');
  return {
    status: failed ? 'failed' : 'passed',
    findings,
    scannerVersion: SCANNER_VERSION,
    scannedAt: new Date().toISOString(),
  };
}
