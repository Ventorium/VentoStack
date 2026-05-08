import { defineModel, column } from '@ventostack/database';

export const ScheduleJobLogModel = defineModel('sys_schedule_job_log', {
  id: column.varchar({ primary: true, length: 36 }),
  job_id: column.varchar({ length: 36 }),
  start_at: column.timestamp(),
  end_at: column.timestamp({ nullable: true }),
  status: column.int(),
  result: column.text({ nullable: true }),
  error: column.text({ nullable: true }),
  duration_ms: column.int({ nullable: true }),
}, { timestamps: false });
