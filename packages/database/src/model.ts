// @aeron/database - Model Definition

export interface ColumnOptions {
  primary?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  nullable?: boolean;
  default?: unknown;
  length?: number;
  comment?: string;
  values?: readonly string[];
}

export interface ColumnDef {
  type: string;
  options: ColumnOptions;
}

export interface ModelOptions {
  comment?: string;
  softDelete?: boolean;
  timestamps?: boolean;
}

export interface ModelDefinition<T = Record<string, unknown>> {
  tableName: string;
  columns: Record<string, ColumnDef>;
  options: ModelOptions;
  $type: T;
}

function createColumnDef(type: string, opts?: ColumnOptions): ColumnDef {
  return { type, options: opts ?? {} };
}

export const column = {
  bigint(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("bigint", opts);
  },
  int(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("int", opts);
  },
  varchar(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("varchar", opts);
  },
  text(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("text", opts);
  },
  boolean(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("boolean", opts);
  },
  timestamp(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("timestamp", opts);
  },
  json(opts?: ColumnOptions): ColumnDef {
    return createColumnDef("json", opts);
  },
  enum(opts: ColumnOptions & { values: readonly string[] }): ColumnDef {
    return createColumnDef("enum", opts);
  },
  decimal(opts?: ColumnOptions & { precision?: number; scale?: number }): ColumnDef {
    return createColumnDef("decimal", opts);
  },
};

export function defineModel<T extends Record<string, ColumnDef>>(
  tableName: string,
  columns: T,
  options?: ModelOptions,
): ModelDefinition {
  const resolvedOptions: ModelOptions = {
    comment: options?.comment,
    softDelete: options?.softDelete ?? false,
    timestamps: options?.timestamps ?? true,
  };

  return {
    tableName,
    columns,
    options: resolvedOptions,
    $type: undefined as unknown as Record<string, unknown>,
  };
}
