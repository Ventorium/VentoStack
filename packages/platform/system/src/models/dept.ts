import { column, defineModel } from "@ventostack/database";

export const DeptModel = defineModel(
  "sys_dept",
  {
    id: column.varchar({ primary: true, length: 36 }),
    parent_id: column.varchar({ length: 36, nullable: true }),
    name: column.varchar({ length: 64 }),
    sort: column.int({ default: 0 }),
    leader_user_id: column.varchar({ length: 36, nullable: true }),
    status: column.int({ default: 1 }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { softDelete: true, timestamps: true },
);
