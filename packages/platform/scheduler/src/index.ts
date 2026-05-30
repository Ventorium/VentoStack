/**
 * @ventostack/scheduler — 定时任务管理
 *
 * 提供定时任务 CRUD、启停控制、立即执行、执行日志查询。
 * 对接 @ventostack/events 的 Scheduler 实现底层调度。
 */

// Models
export { ScheduleJobModel } from "./models/schedule-job";
export { ScheduleJobLogModel } from "./models/schedule-job-log";

// Services
export { createSchedulerService, JobStatus, LogStatus } from "./services/scheduler";
export type {
  CreateJobParams,
  ScheduleJob,
  ScheduleJobLog,
  PaginatedResult,
  JobHandlerMap,
  SchedulerService,
} from "./services/scheduler";

// Routes
export { createSchedulerRoutes } from "./routes/scheduler";

// Module
export { createSchedulerModule } from "./module";
export type { SchedulerModule, SchedulerModuleDeps } from "./module";

// Migrations
export { createSchedulerTables } from "./migrations/001_create_scheduler_tables";
