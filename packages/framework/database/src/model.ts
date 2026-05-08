/**
 * @ventostack/database — 模型定义
 * 提供无 class 的列类型工厂、模型定义函数与类型推导工具
 * 所有列类型均携带编译期类型信息，支持 nullable、default、primary 等约束
 */

/**
 * 列级选项，用于控制字段约束与行为。
 */
export interface ColumnOptions {
  /** 是否为主键 */
  primary?: boolean;
  /** 是否自增 */
  autoIncrement?: boolean;
  /** 是否唯一 */
  unique?: boolean;
  /** 是否允许为空 */
  nullable?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 长度限制（如 varchar 长度） */
  length?: number;
  /** 字段注释 */
  comment?: string;
  /** 枚举可选值（仅 enum 类型使用） */
  values?: readonly string[];
}

/**
 * 列定义，携带 TypeScript 类型信息。
 * @template T — 该列对应的 TypeScript 类型
 */
export interface ColumnDef<T = unknown> {
  /** 数据库类型名称（如 bigint、varchar、json 等） */
  type: string;
  /** 列选项（约束、默认值等） */
  options: ColumnOptions;
  /** 编译期类型标记（无运行时值，仅用于类型推导） */
  $type?: T;
}

/**
 * 模型级选项，控制表级行为。
 */
export interface ModelOptions {
  /** 表注释 */
  comment?: string;
  /** 是否启用软删除（自动维护 deleted_at） */
  softDelete?: boolean;
  /** 是否自动维护 created_at / updated_at */
  timestamps?: boolean;
}

/**
 * 从 ColumnDef 推断列的输出类型（处理 nullable）。
 * 若列允许为空，则推导为 V | null，否则为 V。
 * @template T — ColumnDef 类型
 */
export type InferColumnType<T extends ColumnDef> = T extends ColumnDef<infer V>
  ? T["options"] extends { nullable: true }
    ? V | null
    : V
  : unknown;

/**
 * 从 columns 对象推断整行类型。
 * @template T — Record<string, ColumnDef> 的列定义对象
 */
export type InferRowType<T extends Record<string, ColumnDef>> = {
  [K in keyof T]: T[K] extends ColumnDef ? InferColumnType<T[K]> : unknown;
};

/**
 * 模型定义，包含表名、列定义、选项与行类型标记。
 * @template T — 行类型（由 defineModel 自动推导）
 */
export interface ModelDefinition<T = Record<string, unknown>> {
  /** 数据库表名 */
  tableName: string;
  /** 列定义映射（字段名 → ColumnDef） */
  columns: Record<string, ColumnDef>;
  /** 模型级选项 */
  options: ModelOptions;
  /** 编译期行类型标记（无运行时值） */
  $type: T;
}

/**
 * 创建列定义对象，保留具体选项类型以支持编译期 nullable 推导。
 * @template T — 列的 TypeScript 类型
 * @template Opts — 具体的列选项类型
 * @param type — 数据库类型名称
 * @param opts — 列选项
 * @returns ColumnDef 对象（options 字段保留具体类型）
 */
function createColumnDef<T, Opts extends ColumnOptions = ColumnOptions>(type: string, opts?: Opts): ColumnDef<T> & { options: Opts } {
  return { type, options: (opts ?? {}) as Opts } as ColumnDef<T> & { options: Opts };
}

/**
 * 列类型工厂，提供常用数据库类型的类型安全构造方法。
 * 每个方法保留传入选项的具体类型，使 InferColumnType 能在编译期检测 nullable。
 */
export const column = {
  /** 64 位整型 */
  bigint<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<bigint> & { options: Opts } {
    return createColumnDef<bigint, Opts>("bigint", opts);
  },
  /** 32 位整型 */
  int<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<number> & { options: Opts } {
    return createColumnDef<number, Opts>("int", opts);
  },
  /** 变长字符串 */
  varchar<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("varchar", opts);
  },
  /** 长文本 */
  text<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("text", opts);
  },
  /** 布尔值 */
  boolean<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<boolean> & { options: Opts } {
    return createColumnDef<boolean, Opts>("boolean", opts);
  },
  /** 时间戳 */
  timestamp<Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<Date> & { options: Opts } {
    return createColumnDef<Date, Opts>("timestamp", opts);
  },
  /**
   * JSON 列。
   * @template T — JSON 反序列化后的 TypeScript 类型
   */
  json<T = unknown, Opts extends ColumnOptions = ColumnOptions>(opts?: Opts): ColumnDef<T> & { options: Opts } {
    return createColumnDef<T, Opts>("json", opts);
  },
  /**
   * 枚举列。
   * @template T — 枚举字符串字面量联合类型
   * @param opts — 必须包含 values 数组
   */
  enum<T extends string, Opts extends ColumnOptions & { values: readonly T[] } = ColumnOptions & { values: readonly T[] }>(opts: Opts): ColumnDef<T> & { options: Opts } {
    return createColumnDef<T, Opts>("enum", opts);
  },
  /**
   * 定点数（以字符串存储，避免浮点精度问题）。
   * @param opts — 可包含 precision（精度）与 scale（小数位）
   */
  decimal<Opts extends ColumnOptions & { precision?: number; scale?: number } = ColumnOptions & { precision?: number; scale?: number }>(opts?: Opts): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("decimal", opts);
  },
};

/**
 * 定义数据模型。
 * @template T — 列定义对象类型（Record<string, ColumnDef>）
 * @param tableName — 数据库表名
 * @param columns — 列定义对象
 * @param options — 模型级选项（软删除、时间戳等）
 * @returns 携带完整行类型的 ModelDefinition
 */
/**
 * 根据 ModelOptions 判断是否启用时间戳列。
 * timestamps 默认为 true，除非显式传入 false。
 */
type HasTimestamps<O extends ModelOptions | undefined> =
  O extends { timestamps: false } ? false : true;

/**
 * 根据 ModelOptions 判断是否启用软删除列。
 */
type HasSoftDelete<O extends ModelOptions | undefined> =
  O extends { softDelete: true } ? true : false;

/**
 * 根据选项向行类型追加自动维护的列。
 */
type WithAutoColumns<Row, O extends ModelOptions | undefined> =
  Row &
  (HasTimestamps<O> extends true ? { created_at: Date; updated_at: Date } : unknown) &
  (HasSoftDelete<O> extends true ? { deleted_at: Date | null } : unknown);

export function defineModel<T extends Record<string, ColumnDef>, O extends ModelOptions = ModelOptions>(
  tableName: string,
  columns: T,
  options?: O,
): ModelDefinition<WithAutoColumns<InferRowType<T>, O>> {
  const resolvedOptions: ModelOptions = {
    softDelete: options?.softDelete ?? false,
    timestamps: options?.timestamps ?? true,
  };
  if (options?.comment) {
    resolvedOptions.comment = options.comment;
  }

  return {
    tableName,
    columns,
    options: resolvedOptions,
    $type: undefined as unknown as WithAutoColumns<InferRowType<T>, O>,
  };
}
