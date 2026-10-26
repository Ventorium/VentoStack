# AI Agent 后台任务与定时唤醒 — 设计说明

> 状态：已落地（v1）。实现见 `packages/framework/ai` 的 `background-task-*`、`run-registry`；前端入口见对话页「后台任务」页签与 `/app/ai/tasks`。

## 1. 需求

Agent 发起长任务（超大文件下载、长构建、外部系统轮询）后：

1. 会话可以结束（用户关页面 / 断开），任务继续在服务端跑；
2. 一个会话可挂多个后台任务；
3. 任务可按定时/条件恢复**同一会话**继续执行：每 10 分钟检查下载进度、价格低于阈值后继续后续动作；
4. 涉及对话之外的模块：调度、租约/多实例、通知、权限审计、前端可视化。

## 2. 参考实现调研

### pi（本仓库 `.repos/pi`，Agent 引擎的参考实现）

结论：**pi 没有后台任务/定时调度能力**，但它的 durable operation 设计高度相关：

- `packages/agent/src/harness/agent-harness.ts`：`SuspendedOperation` / `DeferredHandle` / lane `suspended` 状态，`resume()` 只续跑已 open 的 operation；`NothingToResume` 语义；
- `packages/agent/src/harness/reducer.ts` + `docs/harness-v2.md`：意图记录（operation_started / write_deferred / step_attempt）+ 预分配 entry id 的幂等恢复协议；deferred handle 每次 resume 只 fetch 一次，pending 重新挂起、ready 续跑；
- `packages/session-backends/sqlite-node`：`writer_leases`（带 fence 的写者租约）+ `lanes.open_operation_id` 单开放操作约束，是「进程重启后安全接管」的基础设施；
- `packages/server/src/sessions.ts`：客户端断开后 run 继续，但跑完即 dispose，没有「suspended 等待外部条件」的托管；
- detached 子进程（`packages/coding-agent/src/core/tools/bash.ts`、`agent/src/harness/env/nodejs.ts`）：仅用于进程组管理/清理，**不能**用来实现后台任务（进程随父进程退出被杀、无输出回传、无完成事件）。

**借鉴方式**：把「后台脚本」建模为一条 durable 意图 + 外部句柄（`{taskId, sandboxId, pid, logPath, exitPath}`），调度器扮演 `resume()` 的角色：探测到句柄就绪（exit 文件）→ 追加 result entry → 继续 run。租约/崩溃恢复对齐其 writer lease 语义。

### 业界产品与框架

- **DeepSeek Harness（官方开源 agent harness）**：job 状态机 `running/stopping/completed/killed/failed`；`job/registered`、`job/settled` 写回原 owner Session 历史；输出用有界 ring buffer；并发上限 `maxConcurrentJobsPerOwner=10`；schedule 支持 once/every/daily/weekly/cron + IANA 时区，命中后**恢复原 Session 并 queue 一条 follow-up**，重启后补发逾时一次性任务、周期任务只补最近一次；明确只承诺 at-least-once。参考：[jobs](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs)、[schedule](https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule)。
- **WorkBuddy（腾讯）**：定时任务面板（任务/运行记录两个 Tab）、任务级启用/暂停、运行级成功/失败/运行中、点运行记录进入对应会话继续对话；通知三通道；权限两档「完全访问（无人值守）/默认（敏感操作等确认）」。参考：[定时任务](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Automation-Guide)、[任务管理](https://www.workbuddy.cn/docs/workbuddy/Task-Management)。
- **Durable execution 模式**：Temporal 的 durable timer / `wait_condition` / signal-with-start、Inngest `step.sleep`/`waitForEvent`、Trigger.dev `wait.for`/waitpoint token、LangGraph checkpointer + interrupt。可映射到本实现的原语：`task.id + scheduled_at`（幂等键）、`next_run_at`（durable timer）、`condition_command`（轮询条件）、`lease_owner/expires_at`（heartbeat 抢占）、`run` 台账（事件记录）。参考：[Temporal delayed callback](https://docs.temporal.io/design-patterns/delayed-callback)、[Temporal polling](https://docs.temporal.io/design-patterns/polling)、[Inngest waitForEvent](https://www.inngest.com/docs/durable-execution/primitives/step-waitforevent)。
- 编码 Agent 的异步形态：Claude Code `run_in_background` + headless `--resume`、OpenAI Responses background mode、Cursor Cloud Agents API、Codex cloud 任务。共性：任务与会话一对多、恢复靠追加消息、产物落文件。

## 3. 方案选择

| 方案 | 结论 |
| --- | --- |
| A. 进程内定时器（Map + setInterval） | 重启即丢、多实例重复执行，不满足「会话结束任务继续」 |
| **B. DB 持久任务表 + 租约调度 + 会话消息续接（采用）** | 状态外置、崩溃可恢复、多实例可抢锁；改动集中在 framework/ai，无新增部署单元 |
| C. 独立 worker/队列 | 隔离性最好，但需要新增部署单元与运维成本；B 的 claim/lease 接口可平滑演进到 C |

**放在 framework/ai 而不是新平台模块**的原因：后台任务需要直接调用 `agentLoop.runStream`、`buildToolRegistry`、会话记忆、审批授权链路与 VM 运行时托管；这些都在 AI 模块内部，拆出去只能做「结构兼容接口」的重复声明（参考 ai-channel 的写法），收益低。

## 4. 实现映射

| 调研概念 | 本实现 |
| --- | --- |
| durable operation + deferred handle | `ai_background_task` 行（意图 + 执行句柄）+ `ai_background_task_run` 台账 |
| lane `suspended` + resume | 定时任务 `waiting → running`；脚本任务 `running` 期间每次 tick 探活（等价 deferred probe） |
| writer lease / fence | `lease_owner/lease_expires_at` + `claimDue` 的 `FOR UPDATE SKIP LOCKED` + 启动 `reconcileStale` |
| `job/settled` 写回会话 | 完成/触发时向原会话 append user 消息（带 runId/状态/输出摘要） |
| maxConcurrentJobsPerOwner | 用户级活跃任务上限（默认 10） |
| schedule 恢复原 Session | `runAgentTurn` 以原 `sessionId` 调 `agentLoop.runStream`，`RunRegistry` 与 Web 对话互斥 |
| 无人值守审批策略 | `unattended: true`：需人工审批的工具立即拒绝；`runMode=auto` 由审批子智能体判定 |
| 幂等 at-least-once | `(task_id, scheduled_at) WHERE trigger='schedule'` 唯一索引 + 任务结算 first-wins |

## 5. 安全边界

- 脚本任务只在 Agent 虚拟机内执行（`requiresVirtualEnvironment` fail-closed），不在服务进程跑任意命令；
- 创建类工具 high 风险 + 人工审批；取消/查询类 low（保证无人值守轮能自我收尾）；
- 租户/用户双栅栏，跨归属 404；任务 tenantId 只从任务行读取，不信任调度参数；
- 脚本输出截断并标注「不可信数据」，防止 prompt injection 穿透到执行面；
- 每 tick 有限流（`maxTriggerPerTick` / `maxScriptsPerTick`），定时唤醒有墙钟超时（默认 10 分钟）。

## 6. 与 DeepSeek Harness 的差距与兜底补强

首版实现是「按 DSH 的语义自研」，不是 DSH 代码移植；交互与可靠性上逐步对齐：

| DSH 能力 | 本实现 |
| --- | --- |
| job 状态机 running/stopping/completed/killed/failed | 任务状态机 pending/waiting/running/paused/completed/failed/cancelled/interrupted + run 台账 |
| `job/registered`、`job/settled` 写回原会话 | 会话 JSONL 写 `background_task` 自定义条目，前端还原为时间线事件卡片（可点开详情） |
| 有界输出 ring buffer | 台账 8KB + 注入会话 2KB，尾部截断并标注「不可信数据」 |
| maxConcurrentJobsPerOwner=10 | 用户级活跃任务上限 10 |
| 显式 timeout | 脚本 `max_runtime_seconds/deadline_at`（默认 6h）；唤醒轮墙钟超时 10min |
| schedule 有效期/补发策略 | 定时任务 `expires_at`（默认 7 天）+ 到期即结束；停机只补最近一次 |
| settlement first-wins | 取消/暂停后不回写 waiting；调度唯一索引防重复 |
| 进程崩溃恢复 | 每轮回收租约过期的 running 任务（定时重排、脚本中断通知） |
| 无人值守审批 | `unattended`：需人工审批的工具立即拒绝，不挂起等待 |

尚未对齐（后续可做）：任务输出增量进度事件（DSH 的 `job/progress`）、跨实例实时事件订阅（DSH 的 session.event 推送，当前为 6s 轮询）、`wait(timeout)` 式同步等待。

## 7. 已知限制与后续演进

- 脚本任务不自动跨进程重启（无法确认副作用）；可演进为「checkpoint + 幂等重放」满足可恢复脚本；
- cron 按服务端本地时区解释；多时区需求可加 `timezone` 列与 IANA 计算；
- 条件触发目前是「到点 + 可选脚本条件」；实时性场景可接 webhook/signal 直接提前 `next_run_at`；
- 未来可把调度循环搬进独立 Bun worker（方案 C），claim/lease/`runAgentTurn` 接口无需改动。
