// @aeron/core - A/B 测试与灰度发布

export interface ABTestVariant {
  name: string;
  weight: number;
  config?: Record<string, unknown>;
}

export interface ABTest {
  name: string;
  enabled: boolean;
  variants: ABTestVariant[];
  /** 用户粘性分配（基于 userId hash） */
  sticky?: boolean;
}

export interface ABTestResult {
  testName: string;
  variant: string;
  config?: Record<string, unknown>;
}

export interface ABTestManager {
  define(test: ABTest): void;
  assign(testName: string, userId?: string): ABTestResult | null;
  isInVariant(testName: string, variantName: string, userId?: string): boolean;
  list(): ABTest[];
  enable(testName: string): void;
  disable(testName: string): void;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * 创建 A/B 测试管理器
 * 支持按用户/流量切换、动态开关、权重分配
 */
export function createABTestManager(): ABTestManager {
  const tests = new Map<string, ABTest>();
  const stickyAssignments = new Map<string, string>();

  function assignVariant(test: ABTest, userId?: string): ABTestVariant {
    const variants = test.variants;
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

    if (test.sticky && userId) {
      const cacheKey = `${test.name}:${userId}`;
      const cached = stickyAssignments.get(cacheKey);
      if (cached) {
        const variant = variants.find((v) => v.name === cached);
        if (variant) return variant;
      }
    }

    let random: number;
    if (test.sticky && userId) {
      random = (hashCode(`${test.name}:${userId}`) % 10000) / 10000;
    } else {
      random = Math.random();
    }

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight / totalWeight;
      if (random < cumulative) {
        if (test.sticky && userId) {
          stickyAssignments.set(`${test.name}:${userId}`, variant.name);
        }
        return variant;
      }
    }

    return variants[variants.length - 1]!;
  }

  return {
    define(test: ABTest): void {
      if (test.variants.length === 0) {
        throw new Error(`A/B test must have at least one variant: ${test.name}`);
      }
      if (tests.has(test.name)) {
        throw new Error(`Test "${test.name}" is already defined`);
      }
      tests.set(test.name, { ...test });
    },

    assign(testName: string, userId?: string): ABTestResult | null {
      const test = tests.get(testName);
      if (!test) {
        throw new Error(`Test "${testName}" is not found`);
      }
      if (!test.enabled) return null;

      const variant = assignVariant(test, userId);
      return {
        testName,
        variant: variant.name,
        config: variant.config,
      };
    },

    isInVariant(testName: string, variantName: string, userId?: string): boolean {
      const result = this.assign(testName, userId);
      return result?.variant === variantName;
    },

    list(): ABTest[] {
      return Array.from(tests.values());
    },

    enable(testName: string): void {
      const test = tests.get(testName);
      if (test) test.enabled = true;
    },

    disable(testName: string): void {
      const test = tests.get(testName);
      if (test) test.enabled = false;
    },
  };
}
