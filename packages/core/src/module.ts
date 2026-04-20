// @aeron/core - 模块系统

import type { Router } from "./router";

export interface ModuleDefinition {
  name: string;
  disabled?: boolean;
  routes?: (router: Router) => void;
  services?: Record<string, unknown>;
  onInit?: () => Promise<void> | void;
  onDestroy?: () => Promise<void> | void;
}

export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export interface ModuleRegistry {
  register(module: ModuleDefinition): void;
  getModule(name: string): ModuleDefinition | undefined;
  listModules(): ModuleDefinition[];
  initAll(): Promise<void>;
  destroyAll(): Promise<void>;
  applyRoutes(router: Router): void;
}

export function createModuleRegistry(): ModuleRegistry {
  const modules: ModuleDefinition[] = [];
  const moduleMap = new Map<string, ModuleDefinition>();

  return {
    register(module) {
      if (module.disabled) {
        return;
      }
      if (moduleMap.has(module.name)) {
        throw new Error(`Module "${module.name}" is already registered`);
      }
      modules.push(module);
      moduleMap.set(module.name, module);
    },

    getModule(name) {
      return moduleMap.get(name);
    },

    listModules() {
      return [...modules];
    },

    async initAll() {
      for (const mod of modules) {
        if (mod.onInit) {
          await mod.onInit();
        }
      }
    },

    async destroyAll() {
      for (let i = modules.length - 1; i >= 0; i--) {
        const mod = modules[i]!;
        if (mod.onDestroy) {
          await mod.onDestroy();
        }
      }
    },

    applyRoutes(router) {
      for (const mod of modules) {
        if (mod.routes) {
          mod.routes(router);
        }
      }
    },
  };
}
