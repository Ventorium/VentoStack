/**
 * 国际化语言模型
 */

import { column, defineModel } from "@ventostack/database";

export const I18nLocaleModel = defineModel(
  "sys_i18n_locale",
  {
    id: column.varchar({ primary: true, length: 36 }),
    code: column.varchar({ length: 32 }),
    name: column.varchar({ length: 128 }),
    is_default: column.boolean({ default: false }),
    sort: column.int({ default: 0 }),
    status: column.int({ default: 1 }),
    remark: column.varchar({ length: 512, nullable: true }),
  },
  { timestamps: true },
);
