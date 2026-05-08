import { defineModel, column } from '@ventostack/database';

export const MfaRecoveryModel = defineModel('sys_mfa_recovery', {
  id: column.varchar({ primary: true, length: 36 }),
  user_id: column.varchar({ length: 36 }),
  code_hash: column.varchar({ length: 128 }),
  used_at: column.timestamp({ nullable: true }),
  created_at: column.timestamp(),
}, { timestamps: false });
