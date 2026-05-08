import { defineModel, column } from '@ventostack/database';

export const DeptModel = defineModel('sys_dept', {
  id: column.varchar({ primary: true, length: 36 }),
  parent_id: column.varchar({ length: 36, nullable: true }),
  name: column.varchar({ length: 64 }),
  sort: column.int({ default: 0 }),
  leader: column.varchar({ length: 64, nullable: true }),
  phone: column.varchar({ length: 20, nullable: true }),
  email: column.varchar({ length: 128, nullable: true }),
  status: column.int({ default: 1 }),
}, { softDelete: true, timestamps: true });
