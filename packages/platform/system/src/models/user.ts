import { defineModel, column } from '@ventostack/database';

export const UserModel = defineModel('sys_user', {
  id: column.varchar({ primary: true, length: 36 }),
  username: column.varchar({ length: 64 }),
  password_hash: column.varchar({ length: 128 }),
  nickname: column.varchar({ length: 64, nullable: true }),
  email: column.varchar({ length: 128, nullable: true }),
  phone: column.varchar({ length: 20, nullable: true }),
  avatar: column.varchar({ length: 512, nullable: true }),
  gender: column.int({ nullable: true, default: 0 }),
  status: column.int({ default: 1 }),
  dept_id: column.varchar({ length: 36, nullable: true }),
  mfa_enabled: column.boolean({ default: false }),
  mfa_secret: column.varchar({ length: 64, nullable: true }),
  blacklisted: column.boolean({ default: false }),
  locked_until: column.timestamp({ nullable: true }),
  login_attempts: column.int({ nullable: true, default: 0 }),
  password_changed_at: column.timestamp({ nullable: true }),
  remark: column.varchar({ length: 512, nullable: true }),
}, { softDelete: true, timestamps: true });
