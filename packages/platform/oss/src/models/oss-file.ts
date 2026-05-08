import { defineModel, column } from '@ventostack/database';

export const OSSFileModel = defineModel('sys_oss_file', {
  id: column.varchar({ primary: true, length: 36 }),
  original_name: column.varchar({ length: 256 }),
  storage_path: column.varchar({ length: 512 }),
  size: column.bigint(),
  mime_type: column.varchar({ length: 128, nullable: true }),
  extension: column.varchar({ length: 16, nullable: true }),
  bucket: column.varchar({ length: 64, default: 'default' }),
  uploader_id: column.varchar({ length: 36, nullable: true }),
  ref_count: column.int({ default: 0 }),
  metadata: column.json({ nullable: true }),
}, { timestamps: true });
