// @aeron/testing - Fixture 管理

export interface FixtureManager {
  register<T>(name: string, data: T): void;
  get<T>(name: string): T;
  has(name: string): boolean;
  loadJSON<T>(name: string, filePath: string): Promise<void>;
  reset(): void;
}

export function createFixtureManager(): FixtureManager {
  const store = new Map<string, unknown>();

  return {
    register<T>(name: string, data: T): void {
      if (store.has(name)) {
        throw new Error(`Fixture "${name}" is already registered`);
      }
      store.set(name, data);
    },

    get<T>(name: string): T {
      if (!store.has(name)) {
        throw new Error(`Fixture "${name}" not found`);
      }
      return store.get(name) as T;
    },

    has(name: string): boolean {
      return store.has(name);
    },

    async loadJSON<T>(name: string, filePath: string): Promise<void> {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        throw new Error(`Fixture file not found: ${filePath}`);
      }
      const data = (await file.json()) as T;
      store.set(name, data);
    },

    reset(): void {
      store.clear();
    },
  };
}
