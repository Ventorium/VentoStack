import { defineModel, column } from '@ventostack/database';

export const GenTableColumnModel = defineModel('sys_gen_table_column', {
  id: column.varchar({ primary: true, length: 36 }),
  table_id: column.varchar({ length: 36 }),
  column_name: column.varchar({ length: 128 }),
  column_type: column.varchar({ length: 64 }),
  typescript_type: column.varchar({ length: 64 }),
  field_name: column.varchar({ length: 128 }),
  field_comment: column.varchar({ length: 256, nullable: true }),
  is_primary: column.boolean({ default: false }),
  is_nullable: column.boolean({ default: false }),
  is_list: column.boolean({ default: true }),
  is_insert: column.boolean({ default: true }),
  is_update: column.boolean({ default: true }),
  is_query: column.boolean({ default: false }),
  query_type: column.varchar({ length: 32, nullable: true }),
  sort: column.int({ default: 0 }),
}, { timestamps: false });
