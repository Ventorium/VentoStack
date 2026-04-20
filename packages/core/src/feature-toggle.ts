// @aeron/core - Feature Toggle（特性开关）

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  /** 可选的条件函数 */
  condition?: (context: Record<string, unknown>) => boolean;
  /** 描述 */
  description?: string;
}

export interface FeatureToggle {
  register(flag: FeatureFlag): void;
  isEnabled(name: string, context?: Record<string, unknown>): boolean;
  enable(name: string): void;
  disable(name: string): void;
  toggle(name: string): void;
  list(): readonly FeatureFlag[];
  /** 批量设置 */
  setAll(flags: Record<string, boolean>): void;
}

export function createFeatureToggle(initial?: FeatureFlag[]): FeatureToggle {
  const flags = new Map<string, FeatureFlag>();

  if (initial) {
    for (const flag of initial) {
      flags.set(flag.name, { ...flag });
    }
  }

  return {
    register(flag) {
      flags.set(flag.name, { ...flag });
    },

    isEnabled(name, context) {
      const flag = flags.get(name);
      if (!flag) return false;
      if (!flag.enabled) return false;
      if (flag.condition && context) {
        return flag.condition(context);
      }
      return flag.enabled;
    },

    enable(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = true;
    },

    disable(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = false;
    },

    toggle(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = !flag.enabled;
    },

    list() {
      return [...flags.values()];
    },

    setAll(newFlags) {
      for (const [name, enabled] of Object.entries(newFlags)) {
        const flag = flags.get(name);
        if (flag) {
          flag.enabled = enabled;
        } else {
          flags.set(name, { name, enabled });
        }
      }
    },
  };
}
