// @aeron/testing - 测试数据工厂

type FieldGenerator<T> = T | (() => T);

export interface FactoryDefinition<T extends Record<string, unknown>> {
  fields: { [K in keyof T]: FieldGenerator<T[K]> };
}

export interface Factory<T extends Record<string, unknown>> {
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
  buildSequence(count: number, fn: (index: number) => Partial<T>): T[];
}

function resolveField<T>(generator: FieldGenerator<T>): T {
  return typeof generator === "function"
    ? (generator as () => T)()
    : generator;
}

export function defineFactory<T extends Record<string, unknown>>(
  definition: FactoryDefinition<T>,
): Factory<T> {
  function build(overrides?: Partial<T>): T {
    const result = {} as Record<string, unknown>;
    for (const key of Object.keys(definition.fields)) {
      result[key] = resolveField(
        definition.fields[key as keyof T] as FieldGenerator<unknown>,
      );
    }
    if (overrides) {
      for (const key of Object.keys(overrides)) {
        result[key] = overrides[key as keyof T];
      }
    }
    return result as T;
  }

  return {
    build,
    buildMany(count: number, overrides?: Partial<T>): T[] {
      return Array.from({ length: count }, () => build(overrides));
    },
    buildSequence(count: number, fn: (index: number) => Partial<T>): T[] {
      return Array.from({ length: count }, (_, i) => build(fn(i)));
    },
  };
}

export function sequence(prefix = "item"): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `${prefix}_${counter}`;
  };
}

export function oneOf<T>(...values: T[]): () => T {
  return () => values[Math.floor(Math.random() * values.length)]!;
}

export function uuid(): () => string {
  return () => crypto.randomUUID();
}
