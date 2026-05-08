import { defineModel, column } from '@ventostack/database';

export const PasskeyModel = defineModel('sys_passkey', {
  id: column.varchar({ primary: true, length: 36 }),
  user_id: column.varchar({ length: 36 }),
  name: column.varchar({ length: 128 }),
  credential_id: column.varchar({ length: 512 }),
  public_key: column.text(),
  counter: column.bigint({ default: 0 }),
  transports: column.varchar({ length: 256, nullable: true }),
  device_type: column.varchar({ length: 64, nullable: true }),
  backed_up: column.boolean({ default: false }),
  aaguid: column.varchar({ length: 128, nullable: true }),
  last_used_at: column.timestamp({ nullable: true }),
  created_at: column.timestamp(),
}, { timestamps: false });
