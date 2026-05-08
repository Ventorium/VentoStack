import { defineModel, column } from '@ventostack/database';

export const GenTableModel = defineModel('sys_gen_table', {
  id: column.varchar({ primary: true, length: 36 }),
  table_name: column.varchar({ length: 128 }),
  class_name: column.varchar({ length: 128 }),
  module_name: column.varchar({ length: 64 }),
  function_name: column.varchar({ length: 128 }),
  function_author: column.varchar({ length: 64, nullable: true }),
  remark: column.varchar({ length: 512, nullable: true }),
  status: column.int({ default: 0 }),
}, { timestamps: true });
