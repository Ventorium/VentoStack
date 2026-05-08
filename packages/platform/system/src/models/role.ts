import { defineModel, column } from '@ventostack/database';

export const RoleModel = defineModel('sys_role', {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 64 }),
  code: column.varchar({ length: 64, unique: true }),
  sort: column.int({ default: 0 }),
  data_scope: column.int({ nullable: true }),
  status: column.int({ default: 1 }),
  remark: column.varchar({ length: 512, nullable: true }),
}, { softDelete: true, timestamps: true });

export const UserRoleModel = defineModel('sys_user_role', {
  user_id: column.varchar({ length: 36 }),
  role_id: column.varchar({ length: 36 }),
}, { timestamps: false });
