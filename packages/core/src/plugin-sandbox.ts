// @aeron/core - 插件隔离

export interface PluginSandbox {
  /** 注册插件（隔离执行） */
  register(plugin: Plugin): void;
  /** 获取已注册插件列表 */
  list(): PluginInfo[];
  /** 初始化所有插件 */
  initAll(context: unknown): Promise<PluginInitResult[]>;
  /** 销毁所有插件 */
  destroyAll(): Promise<void>;
}

export interface PluginInfo {
  name: string;
  version?: string;
  status: "registered" | "initialized" | "failed" | "destroyed";
  error?: string;
}

export interface PluginInitResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

export interface IsolatedPlugin {
  name: string;
  version?: string;
  install?(context: unknown): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

/**
 * 创建插件沙箱，提供隔离的插件执行环境
 * 每个插件在独立的 try/catch 中执行，单个插件失败不影响其他插件
 */
export function createPluginSandbox(): PluginSandbox {
  const plugins: { plugin: IsolatedPlugin; info: PluginInfo }[] = [];

  return {
    register(plugin: IsolatedPlugin): void {
      const existing = plugins.find((p) => p.info.name === plugin.name);
      if (existing) {
        throw new Error(`Plugin already registered: ${plugin.name}`);
      }
      plugins.push({
        plugin,
        info: {
          name: plugin.name,
          version: plugin.version,
          status: "registered",
        },
      });
    },

    list(): PluginInfo[] {
      return plugins.map((p) => ({ ...p.info }));
    },

    async initAll(context: unknown): Promise<PluginInitResult[]> {
      const results: PluginInitResult[] = [];

      for (const entry of plugins) {
        const start = performance.now();
        try {
          if (entry.plugin.install) {
            await entry.plugin.install(context);
          }
          entry.info.status = "initialized";
          results.push({
            name: entry.info.name,
            success: true,
            duration: performance.now() - start,
          });
        } catch (err) {
          entry.info.status = "failed";
          entry.info.error = err instanceof Error ? err.message : String(err);
          results.push({
            name: entry.info.name,
            success: false,
            error: entry.info.error,
            duration: performance.now() - start,
          });
        }
      }

      return results;
    },

    async destroyAll(): Promise<void> {
      for (const entry of plugins) {
        try {
          if (entry.plugin.destroy) {
            await entry.plugin.destroy();
          }
        } catch {
          // 忽略销毁错误
        }
        entry.info.status = "destroyed";
      }
    },
  };
}
