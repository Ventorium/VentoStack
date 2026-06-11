import { column, defineModel } from "@ventostack/database";

export const TagModel = defineModel(
  "sys_tag",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 64 }),
    code: column.varchar({ length: 64, unique: true }),
    sort: column.int({ default: 0 }),
    status: column.int({ default: 1 }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { softDelete: true, timestamps: true },
);

export const UserTagModel = defineModel(
  "sys_user_tag",
  {
    user_id: column.varchar({ length: 36 }),
    tag_id: column.varchar({ length: 36 }),
  },
  { timestamps: false },
);
