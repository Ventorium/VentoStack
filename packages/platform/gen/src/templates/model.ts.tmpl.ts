/**
 * Model 代码模板
 */

import type { GenColumnInfo, GenTableInfo } from "../services/gen";

export function renderModel(table: GenTableInfo, columns: GenColumnInfo[]): string {
  const fields = columns
    .map((col) => {
      const nullable = col.isNullable ? "{ nullable: true }" : "";
      const primary = col.isPrimary ? "{ primary: true }" : "";
      const opts = [primary, nullable].filter(Boolean).join(", ");
      return `  ${col.fieldName}: column.${col.typescriptType}(${opts}),`;
    })
    .join("\n");

  return `import { defineModel, column } from '@ventostack/database';

export const ${table.className}Model = defineModel('${table.tableName}', {
${fields}
}, { timestamps: true });
`;
}
