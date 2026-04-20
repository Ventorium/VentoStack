// @aeron/database - Relation Definition

import type { ModelDefinition } from "./model";

export type RelationType = "hasOne" | "hasMany" | "belongsTo" | "belongsToMany";

export interface RelationDefinition {
  type: RelationType;
  model: ModelDefinition;
  foreignKey: string;
  localKey: string;
  // belongsToMany specific
  pivotTable?: string;
  pivotForeignKey?: string;
  pivotRelatedKey?: string;
}

export function defineRelation(
  type: RelationType,
  model: ModelDefinition,
  options: {
    foreignKey: string;
    localKey?: string;
    pivotTable?: string;
    pivotForeignKey?: string;
    pivotRelatedKey?: string;
  },
): RelationDefinition {
  if (type === "belongsToMany") {
    if (!options.pivotTable) {
      throw new Error("belongsToMany requires pivotTable");
    }
    if (!options.pivotForeignKey) {
      throw new Error("belongsToMany requires pivotForeignKey");
    }
    if (!options.pivotRelatedKey) {
      throw new Error("belongsToMany requires pivotRelatedKey");
    }
  }

  return {
    type,
    model,
    foreignKey: options.foreignKey,
    localKey: options.localKey ?? "id",
    pivotTable: options.pivotTable,
    pivotForeignKey: options.pivotForeignKey,
    pivotRelatedKey: options.pivotRelatedKey,
  };
}

export function buildJoinSQL(
  baseTable: string,
  relation: RelationDefinition,
  alias?: string,
): string {
  const relatedTable = relation.model.tableName;
  const relatedAlias = alias ?? relatedTable;

  switch (relation.type) {
    case "hasOne":
    case "hasMany":
      // JOIN related ON related.foreignKey = base.localKey
      return `LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.foreignKey} = ${baseTable}.${relation.localKey}`;

    case "belongsTo":
      // JOIN related ON related.localKey = base.foreignKey
      return `LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.localKey} = ${baseTable}.${relation.foreignKey}`;

    case "belongsToMany": {
      const pivot = relation.pivotTable!;
      const pivotFK = relation.pivotForeignKey!;
      const pivotRK = relation.pivotRelatedKey!;
      // JOIN pivot ON pivot.pivotForeignKey = base.localKey
      // JOIN related ON related.localKey = pivot.pivotRelatedKey
      return (
        `LEFT JOIN ${pivot} ON ${pivot}.${pivotFK} = ${baseTable}.${relation.localKey}` +
        ` LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.localKey} = ${pivot}.${pivotRK}`
      );
    }
  }
}

export function buildEagerLoadSQL(
  baseTable: string,
  relation: RelationDefinition,
  parentIds: unknown[],
): { text: string; params: unknown[] } {
  const relatedTable = relation.model.tableName;
  const params = [...parentIds];
  const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(", ");

  switch (relation.type) {
    case "hasOne":
    case "hasMany":
      // SELECT * FROM related WHERE foreignKey IN ($1, $2, ...)
      return {
        text: `SELECT * FROM ${relatedTable} WHERE ${relation.foreignKey} IN (${placeholders})`,
        params,
      };

    case "belongsTo":
      // SELECT * FROM related WHERE localKey IN ($1, $2, ...)
      return {
        text: `SELECT * FROM ${relatedTable} WHERE ${relation.localKey} IN (${placeholders})`,
        params,
      };

    case "belongsToMany": {
      const pivot = relation.pivotTable!;
      const pivotFK = relation.pivotForeignKey!;
      const pivotRK = relation.pivotRelatedKey!;
      // SELECT related.*, pivot.pivotForeignKey FROM related
      // JOIN pivot ON pivot.pivotRelatedKey = related.localKey
      // WHERE pivot.pivotForeignKey IN ($1, $2, ...)
      return {
        text:
          `SELECT ${relatedTable}.*, ${pivot}.${pivotFK} FROM ${relatedTable}` +
          ` LEFT JOIN ${pivot} ON ${pivot}.${pivotRK} = ${relatedTable}.${relation.localKey}` +
          ` WHERE ${pivot}.${pivotFK} IN (${placeholders})`,
        params,
      };
    }
  }
}
