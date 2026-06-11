/**
 * Prompt 注入防护
 * 多层检测：输入预处理 + 关键词检测 + 输出检测
 */

export interface PromptGuardConfig {
  enabled: boolean;
  maxInputLength?: number;
  blockSystemPromptLeak?: boolean;
}

export interface PromptGuardResult {
  safe: boolean;
  level: "safe" | "warning" | "blocked";
  reason?: string;
}

export interface PromptGuard {
  checkInput(message: string): PromptGuardResult;
  checkOutput(output: string, systemPrompt: string): PromptGuardResult;
}

// 注入模式（中英文 + 多语言变体）
const INJECTION_PATTERNS = [
  // 中文
  /忽略.{0,20}(之前|上面|以上).{0,10}(指令|规则|限制)/i,
  /无视.{0,20}(之前|上面|以上).{0,10}(指令|规则|限制)/i,
  /输出.{0,10}(系统|你的).{0,10}(提示|指令|设定)/i,
  /告诉我.{0,10}(系统|你的).{0,10}(提示|指令|设定)/i,
  // 英文
  /ignore.{0,20}(previous|above|all).{0,10}(instructions|rules)/i,
  /disregard.{0,20}(previous|above|all).{0,10}(instructions|rules)/i,
  /output.{0,10}(your|the).{0,10}(system|prompt|instructions)/i,
  /tell me.{0,10}(your|the).{0,10}(system|prompt|instructions)/i,
  // 法语
  /ignorer.{0,20}(précédentes|ci-dessus)/i,
  // 日语
  /無視.{0,20}(指示|命令)/,
];

// System prompt 泄露模式
const LEAK_PATTERNS = [
  /我的(系统|设定|指令).{0,20}(是|如下)/i,
  /我被(设定|指示|编程).{0,20}(为|为)/i,
  /my (system|instructions).{0,20}(are|is)/i,
  /i am (instructed|programmed).{0,20}to/i,
];

export function createPromptGuard(
  config: PromptGuardConfig = { enabled: true },
): PromptGuard {
  const maxInputLength = config.maxInputLength ?? 10000;

  return {
    checkInput(message: string): PromptGuardResult {
      if (!config.enabled) return { safe: true, level: "safe" };

      // 长度检查
      if (message.length > maxInputLength) {
        return {
          safe: false,
          level: "blocked",
          reason: `输入超过最大长度 ${maxInputLength}`,
        };
      }

      // Unicode 预处理
      const normalized = message
        .normalize("NFKC")
        .replace(/[​-‏﻿]/g, ""); // 零宽字符

      // 特殊字符密度检查
      const specialChars = normalized.match(/[^\w\s一-鿿.,!?;:'"()-]/g);
      if (specialChars && specialChars.length / normalized.length > 0.3) {
        return {
          safe: false,
          level: "warning",
          reason: "特殊字符密度过高",
        };
      }

      // 注入模式检测
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(normalized)) {
          return {
            safe: false,
            level: "blocked",
            reason: "检测到可能的注入攻击",
          };
        }
      }

      return { safe: true, level: "safe" };
    },

    checkOutput(output: string, systemPrompt: string): PromptGuardResult {
      if (!config.enabled) return { safe: true, level: "safe" };

      // 检测 system prompt 泄露
      if (config.blockSystemPromptLeak !== false) {
        // 检查输出是否包含 system prompt 的大段内容
        const promptChunks = systemPrompt
          .split(/\n+/)
          .filter((line) => line.trim().length > 20);
        for (const chunk of promptChunks) {
          if (output.includes(chunk)) {
            return {
              safe: false,
              level: "blocked",
              reason: "输出包含系统提示词内容",
            };
          }
        }

        // 检查泄露模式
        for (const pattern of LEAK_PATTERNS) {
          if (pattern.test(output)) {
            return {
              safe: false,
              level: "warning",
              reason: "输出可能泄露系统提示词语义",
            };
          }
        }
      }

      return { safe: true, level: "safe" };
    },
  };
}
