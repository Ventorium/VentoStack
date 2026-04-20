// @aeron/core - 插件系统

import type { AeronApp } from "./app";

export interface Plugin {
  name: string;
  install(app: AeronApp): void | Promise<void>;
}
