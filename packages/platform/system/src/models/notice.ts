import { defineModel, column } from '@ventostack/database';

export const NoticeModel = defineModel('sys_notice', {
  id: column.varchar({ primary: true, length: 36 }),
  title: column.varchar({ length: 256 }),
  content: column.text(),
  type: column.int({ default: 1 }),
  status: column.int({ default: 0 }),
  publisher_id: column.varchar({ length: 36, nullable: true }),
  publish_at: column.timestamp({ nullable: true }),
}, { softDelete: true, timestamps: true });

export const UserNoticeModel = defineModel('sys_user_notice', {
  user_id: column.varchar({ length: 36 }),
  notice_id: column.varchar({ length: 36 }),
  read_at: column.timestamp({ nullable: true }),
}, { timestamps: false });
