/**
 * 国际化语言模型
 */

import { defineModel, column } from "@ventostack/database";

export const I18nLocaleModel = defineModel("sys_i18n_locale", {
  id: column.varchar({ primary: true, length: 36 }),
  code: column.varchar({ length: 32 }),
  name: column.varchar({ length: 128 }),
  is_default: column.boolean({ default: false }),
  status: column.int({ default: 1 }),
}, { timestamps: true });
