import { column, defineModel } from "@ventostack/database";

export const ConfigModel = defineModel(
  "sys_config",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    key: column.varchar({ length: 128, unique: true }),
    value: column.text(),
    type: column.int({ nullable: true }),
    group: column.varchar({ length: 64, nullable: true }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { timestamps: true },
);
