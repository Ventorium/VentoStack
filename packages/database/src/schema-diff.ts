// @aeron/database - 自动检测 Schema 差异

export interface ColumnSchema {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

export interface SchemaDiff {
  addedTables: string[];
  removedTables: string[];
  modifiedTables: TableDiff[];
}

export interface TableDiff {
  table: string;
  addedColumns: ColumnSchema[];
  removedColumns: string[];
  modifiedColumns: ColumnDiff[];
}

export interface ColumnDiff {
  column: string;
  changes: string[];
  from: Partial<ColumnSchema>;
  to: Partial<ColumnSchema>;
}

/**
 * 比较两个 Schema 的差异
 */
export function diffSchemas(current: TableSchema[], target: TableSchema[]): SchemaDiff {
  const currentNames = new Set(current.map((t) => t.name));
  const targetNames = new Set(target.map((t) => t.name));

  const addedTables = target.filter((t) => !currentNames.has(t.name)).map((t) => t.name);
  const removedTables = current.filter((t) => !targetNames.has(t.name)).map((t) => t.name);
  const modifiedTables: TableDiff[] = [];

  for (const targetTable of target) {
    const currentTable = current.find((t) => t.name === targetTable.name);
    if (!currentTable) continue;

    const diff = diffTable(currentTable, targetTable);
    if (diff.addedColumns.length > 0 || diff.removedColumns.length > 0 || diff.modifiedColumns.length > 0) {
      modifiedTables.push(diff);
    }
  }

  return { addedTables, removedTables, modifiedTables };
}

function diffTable(current: TableSchema, target: TableSchema): TableDiff {
  const currentCols = new Map(current.columns.map((c) => [c.name, c]));
  const targetCols = new Map(target.columns.map((c) => [c.name, c]));

  const addedColumns = target.columns.filter((c) => !currentCols.has(c.name));
  const removedColumns = current.columns.filter((c) => !targetCols.has(c.name)).map((c) => c.name);
  const modifiedColumns: ColumnDiff[] = [];

  for (const [name, targetCol] of targetCols) {
    const currentCol = currentCols.get(name);
    if (!currentCol) continue;

    const changes: string[] = [];
    const from: Partial<ColumnSchema> = {};
    const to: Partial<ColumnSchema> = {};

    if (currentCol.type !== targetCol.type) {
      changes.push("type");
      from.type = currentCol.type;
      to.type = targetCol.type;
    }
    if ((currentCol.nullable ?? true) !== (targetCol.nullable ?? true)) {
      changes.push("nullable");
      from.nullable = currentCol.nullable;
      to.nullable = targetCol.nullable;
    }
    if (currentCol.defaultValue !== targetCol.defaultValue) {
      changes.push("default");
      from.defaultValue = currentCol.defaultValue;
      to.defaultValue = targetCol.defaultValue;
    }

    if (changes.length > 0) {
      modifiedColumns.push({ column: name, changes, from, to });
    }
  }

  return { table: target.name, addedColumns, removedColumns, modifiedColumns };
}

/**
 * 从 diff 生成 migration SQL
 */
export function generateMigrationSQL(diff: SchemaDiff): { up: string[]; down: string[] } {
  const up: string[] = [];
  const down: string[] = [];

  for (const table of diff.addedTables) {
    up.push(`-- CREATE TABLE ${table} (define columns here)`);
    down.push(`DROP TABLE IF EXISTS ${table};`);
  }

  for (const table of diff.removedTables) {
    up.push(`DROP TABLE IF EXISTS ${table};`);
    down.push(`-- CREATE TABLE ${table} (restore columns here)`);
  }

  for (const mod of diff.modifiedTables) {
    for (const col of mod.addedColumns) {
      up.push(`ALTER TABLE ${mod.table} ADD COLUMN ${col.name} ${col.type}${col.nullable === false ? " NOT NULL" : ""}${col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ""};`);
      down.push(`ALTER TABLE ${mod.table} DROP COLUMN ${col.name};`);
    }

    for (const col of mod.removedColumns) {
      up.push(`ALTER TABLE ${mod.table} DROP COLUMN ${col};`);
      down.push(`-- ALTER TABLE ${mod.table} ADD COLUMN ${col} (restore type here);`);
    }

    for (const col of mod.modifiedColumns) {
      if (col.to.type) {
        up.push(`ALTER TABLE ${mod.table} ALTER COLUMN ${col.column} TYPE ${col.to.type};`);
        down.push(`ALTER TABLE ${mod.table} ALTER COLUMN ${col.column} TYPE ${col.from.type};`);
      }
    }
  }

  return { up, down };
}
