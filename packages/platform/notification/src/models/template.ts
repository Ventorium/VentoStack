/**
 * 通知模板模型
 */

import { column, defineModel } from "@ventostack/database";

export const NotifyTemplateModel = defineModel(
  "sys_notify_template",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    code: column.varchar({ length: 64 }),
    channel: column.varchar({ length: 32 }),
    title: column.varchar({ length: 256, nullable: true }),
    content: column.text(),
    sort: column.int({ default: 0 }),
    status: column.int({ default: 1 }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { timestamps: true },
);
