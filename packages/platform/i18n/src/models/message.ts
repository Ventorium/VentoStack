/**
 * 国际化消息模型
 */

import { defineModel, column } from "@ventostack/database";

export const I18nMessageModel = defineModel("sys_i18n_message", {
  id: column.varchar({ primary: true, length: 36 }),
  locale: column.varchar({ length: 32 }),
  code: column.varchar({ length: 256 }),
  value: column.text(),
  module: column.varchar({ length: 64, nullable: true }),
}, { timestamps: true });
