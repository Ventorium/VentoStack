// @aeron/database - Seed 数据填充

import type { SqlExecutor } from "./database";

export interface Seed {
  name: string;
  run: (executor: SqlExecutor) => Promise<void>;
}

export interface SeedRunner {
  addSeed(seed: Seed): void;
  run(options?: { only?: string[] }): Promise<string[]>;
  list(): string[];
}

export function createSeedRunner(executor: SqlExecutor): SeedRunner {
  const seeds: Seed[] = [];

  return {
    addSeed(seed) {
      seeds.push(seed);
    },

    async run(options) {
      const toRun = options?.only
        ? seeds.filter((s) => options.only!.includes(s.name))
        : seeds;

      const sorted = [...toRun].sort((a, b) => a.name.localeCompare(b.name));
      const executed: string[] = [];

      for (const seed of sorted) {
        await seed.run(executor);
        executed.push(seed.name);
      }

      return executed;
    },

    list() {
      return seeds.map((s) => s.name);
    },
  };
}
