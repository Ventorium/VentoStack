import { defineModel, column } from '@ventostack/database';

export const ScheduleJobModel = defineModel('sys_schedule_job', {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 128 }),
  handler_id: column.varchar({ length: 128 }),
  cron: column.varchar({ length: 64, nullable: true }),
  params: column.json({ nullable: true }),
  status: column.int({ default: 0 }),
  description: column.varchar({ length: 512, nullable: true }),
}, { timestamps: true });
