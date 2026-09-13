import { column, defineModel } from '@ventostack/database';

export const ConfigModel = defineModel(
  'sys_config',
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 36, default: 'default' }),
    name: column.varchar({ length: 128 }),
    key: column.varchar({ length: 128 }),
    value: column.text(),
    type: column.int({ nullable: true }),
    group: column.varchar({ length: 64, nullable: true }),
    sort: column.int({ default: 0 }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { timestamps: true },
);
