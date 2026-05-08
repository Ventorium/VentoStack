import { defineModel, column } from '@ventostack/database';

export const DictTypeModel = defineModel('sys_dict_type', {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 64 }),
  code: column.varchar({ length: 64, unique: true }),
  status: column.int({ default: 1 }),
  remark: column.varchar({ length: 512, nullable: true }),
}, { timestamps: true });

export const DictDataModel = defineModel('sys_dict_data', {
  id: column.varchar({ primary: true, length: 36 }),
  type_code: column.varchar({ length: 64 }),
  label: column.varchar({ length: 128 }),
  value: column.varchar({ length: 128 }),
  sort: column.int({ default: 0 }),
  css_class: column.varchar({ length: 64, nullable: true }),
  status: column.int({ default: 1 }),
  remark: column.varchar({ length: 512, nullable: true }),
}, { timestamps: true });
