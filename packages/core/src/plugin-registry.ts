// @aeron/core - 插件注册表

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  dependencies?: string[];
}

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  installedAt: number;
}

export interface PluginRegistry {
  register(manifest: PluginManifest): void;
  unregister(name: string): boolean;
  get(name: string): PluginRegistryEntry | undefined;
  list(): PluginRegistryEntry[];
  search(query: string): PluginRegistryEntry[];
  has(name: string): boolean;
  checkDependencies(name: string): { satisfied: boolean; missing: string[] };
}

/**
 * 创建插件注册表
 */
export function createPluginRegistry(): PluginRegistry {
  const entries = new Map<string, PluginRegistryEntry>();

  return {
    register(manifest: PluginManifest): void {
      if (entries.has(manifest.name)) {
        throw new Error(`Plugin already registered: ${manifest.name}`);
      }
      entries.set(manifest.name, {
        manifest,
        installedAt: Date.now(),
      });
    },

    unregister(name: string): boolean {
      return entries.delete(name);
    },

    get(name: string): PluginRegistryEntry | undefined {
      return entries.get(name);
    },

    list(): PluginRegistryEntry[] {
      return Array.from(entries.values());
    },

    search(query: string): PluginRegistryEntry[] {
      const q = query.toLowerCase();
      return Array.from(entries.values()).filter((entry) => {
        const m = entry.manifest;
        return (
          m.name.toLowerCase().includes(q) ||
          (m.description?.toLowerCase().includes(q) ?? false) ||
          (m.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false)
        );
      });
    },

    has(name: string): boolean {
      return entries.has(name);
    },

    checkDependencies(name: string): { satisfied: boolean; missing: string[] } {
      const entry = entries.get(name);
      if (!entry) {
        return { satisfied: false, missing: [name] };
      }
      const deps = entry.manifest.dependencies ?? [];
      const missing = deps.filter((dep) => !entries.has(dep));
      return { satisfied: missing.length === 0, missing };
    },
  };
}
