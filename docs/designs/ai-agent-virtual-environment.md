# Agent 虚拟机环境（Vento Agent Runtime）设计方案

> 状态：已实现（VentoStack + VentoAgentRuntime 基础改造；真实宿主 E2E 待 Linux/KVM 环境执行）
> 范围：VentoStack（AI 模块、Admin API/Web）+ VentoAgentRuntime（安装、镜像、协议、`/info`）
> 关联需求：AI 能力页新增「虚拟机接入」；Agent 虚拟环境开关补全；知识库/记忆文件化注入；虚拟机生命周期与资源治理。
>
> 本轮修订：`/chat` → `/workspace`；镜像改为 Debian 最小镜像（仅 rg/curl）；隔离维度改为用户+Agent；取消租户配额改为用户配额；闲置 15 天通知用户、30 天通知平台管理员；新增 `/workspace` 重要文件备份与重建恢复。

---

## 1. 结论摘要

1. **宿主机是平台级全局资源**：由拥有 `ai:runtime-host:*` 权限的平台管理员统一接入和管理；普通用户只能使用，不能查看宿主机地址、Token 或他人的实例。
2. **虚拟机实例按 `(user_id, agent_id)` 唯一**：同一用户使用同一 Agent 的所有会话共享一台 VM；不同用户、不同 Agent 相互隔离。`tenant_id` 仅作为现有安全作用域在 SQL 层保留，不作为产品功能维度。
3. **Agent 开关只做能力声明，不预创建 VM**：开启时校验「至少一台在线宿主 + 宿主剩余资源 + 用户配额」；真正创建发生在该用户首次发消息时，并复用已有实例。
4. **Agent 在 VM 内“像本机一样”工作**：去掉 `kb-*` 工具与知识库工具提示，改为把知识库同步到 `/workspace/{session_id}/knowledges`，由 Agent 用 `rg` / `grep` / `find` / `cat` / `sed` / `awk` 等命令探索；镜像只预装 `rg`、`curl` 和 Debian 基础命令。终端描述、报错、工具输出都不暴露 sandbox/远程 API。
5. **知识库精准增量同步**：以 `sha256 + size` 为文件版本，事件驱动 + 会话启动校验 + 定期对账；禁用的文件不进入镜像，删除/重命名会同步删除旧文件；同步后设为只读，并在下一次同步纠正被 Agent 改写的文件。
6. **会话记忆只读镜像，全局记忆双向同步**：`/workspace/{sid}/memories` 从会话 `MEMORY.md` 镜像；`~/.vento-agent/memories` 与用户长期记忆双向同步，回合结束回写，实现跨会话、跨 Agent 的全局认知共享。
7. **VM 默认不自动销毁**：Runtime 空闲只 pause；闲置 15 天站内信提醒用户本人，30 天提醒平台管理员；不自动 destroy。
8. **释放前先备份工作区**：`/workspace` 中 Agent 自己产生的重要文件会增量同步到 VentoStack（排除注入目录与缓存），释放 VM 后仍可恢复；系统级安装/进程状态不保留。
9. **宿主在线检测由后台定时器负责**：默认 30s 一次，区分 `online / offline / unauthorized / incompatible / disabled`，同时刷新 `/sandboxes` 资源用量并核对实例状态。

---

## 2. 现状与差距

### 2.1 已有能力

- `ai_agent.requires_virtual_environment` 与 `ai_agent.sandbox_id`（迁移 `013_add_agent_runtime`）。
- `AgentRuntimeClient`（`packages/framework/ai/src/agent-runtime/client.ts`）封装 `@ventostack/vm-runtime` 的 NAPI HTTP 客户端，支持创建/查询/销毁 sandbox、执行命令、读写文件。
- Agent Loop 在 `requiresVirtualEnvironment` 时：
  - 注入一段执行环境提示；
  - 用 `resolveAgentTools` 创建 `terminal` / `file_read` / `file_write`。
- 环境变量 `VENTO_RUNTIME_URL` / `VENTO_RUNTIME_TOKEN` / `VENTO_RUNTIME_TIMEOUT_MS` 只支持单台、全局配置的 Runtime。
- Admin 前端已有虚拟环境开关、运行环境列和对话页「虚拟环境」标签。

### 2.2 关键缺口

| 缺口 | 现状 | 影响 |
|---|---|---|
| 宿主机管理 | 只有环境变量单实例 | 无法增删改查、无法扩容、无法看在线状态 |
| 实例维度 | 创建 Agent 时建一台（`ai_agent.sandbox_id`），聊天时又按 session 建一台 | 与「每用户每 Agent 一台」不一致，产生双份沙箱与孤儿 |
| 用户隔离 | 没有实例归属表 | 无法证明不同用户/Agent 不可见，无法按用户计量 |
| 知识库注入 | 仍注册 `kb-*` 工具并提示 Agent 调用 | 与「去掉知识库工具、直接探索目录」冲突 |
| 知识库同步 | 无 | Agent 看不到页面上的知识库变更 |
| 记忆注入 | 仅拼进 system prompt | 没有文件目录，无法全局沉淀 |
| 等待提示 | 创建 VM 在请求内同步阻塞，前端无进度 | 首次对话像卡死 |
| 在线检测 | 无 | 宿主挂了只能在对话时报错 |
| 资源治理 | 无容量/配额概念 | 无法判断能否开启、无法提醒扩容 |
| 生命周期 | 删除会话会 destroy 会话 sandbox；Agent 删除只 destroy 一个 | 会误删共享 VM 或留下孤儿 |

---

## 3. 目标与非目标

### 3.1 目标

- AI 能力页新增「虚拟机接入」Tab：宿主 CRUD、安装命令、连接验证、在线状态、容量与实例列表。
- Agent 虚拟环境开关在创建/编辑时可用，并在开启前做可用性校验。
- 首次对话自动创建、后续对话自动复用/恢复 `(user,agent)` 实例。
- 知识库、会话记忆、全局记忆按约定注入到 VM 固定目录。
- 移除 VM Agent 的 `kb-*` 工具与相关提示，改为文件探索。
- 后台定时检测宿主在线状态与实例健康。
- 资源不足时给出可执行提示：新增宿主或释放旧实例。
- 安全边界、用户级隔离、审计、测试与文档同步落地。
- 释放 VM 前尽量把 `/workspace` 重要文件备份回 VentoStack。

### 3.2 非目标（本期不做）

- 跨宿主实时迁移运行中的 VM（当前 Runtime 的 snapshot 是宿主本地的）。
- VM 内公网访问（当前 Firecracker 后端 fail-closed，无网卡；`curl` 只能访问宿主/guest 内地址，无法安装软件或访问外部 API）。
- 多活部署下的强一致调度（本期用 DB 唯一约束 + 进程内锁 + 监控对账，允许极小概率的重复创建由对账清理）。
- 计费、按量配额结算、VM 图形界面。

---

## 4. 已确认的产品决策

| 决策 | 选择 |
|---|---|
| 宿主机归属 | 全局资源，平台管理员配置；普通用户只使用 |
| 宿主机管理权限 | 新增 `ai:runtime-host:list/create/update/delete/verify`，只授予平台管理员 |
| VM 隔离维度 | `(user_id, agent_id)` 一台；同一用户该 Agent 的所有会话共享；`tenant_id` 仅内部作用域 |
| 资源限制 | 不做租户级限制；不限制单用户 VM 数量；按用户限制 CPU/内存/磁盘；每 VM 仍限制进程数 |
| 命令审批 | VM 内默认信任执行；危险命令硬阻断；每次命令审计；用户仍可切回 `ask` |
| 会话记忆 | 只读镜像 |
| 全局记忆 | 双向同步 |
| 工作区备份 | 增量同步 `/workspace` 重要文件；释放前最终同步；重建时恢复 |
| 闲置提醒 | 15 天站内信通知用户；30 天通知平台管理员；不自动 destroy |
| Runtime 仓库 | 允许改造：一键安装脚本、rootfs 发布产物、`/info`、`~/.vento-agent` 路径策略 |
| 基础镜像 | Debian stable 最新最小镜像；仅预装 `ripgrep`、`curl`（含 ca-certificates） |

---

## 5. 总体架构

```text
┌──────────────────────────── VentoStack Admin Web ────────────────────────────┐
│  AI 能力 / 虚拟机接入 Tab           Agent 编辑弹窗              AI 对话页       │
│  - 宿主 CRUD / 安装命令              - 开关可用性校验            - 环境准备提示   │
│  - 在线状态 / 容量条                 - 资源预估                  - 虚拟环境标签   │
│  - 实例列表 / 释放                   - 失败原因                  - 重试           │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTP / SSE
┌───────────────────────────────▼──────────────────────────────────────────────┐
│                         @ventostack/ai (framework)                           │
│                                                                              │
│  RuntimeHostService ── RuntimeHostMonitor ── RuntimeCapacityService           │
│         │                     │                     │                        │
│         │                     │                     └── 用户配额 / 宿主选择     │
│         ▼                     ▼                                              │
│  RuntimeInstanceManager ── AgentRuntimeClient（按宿主创建）                     │
│         │                                                                     │
│         ├── KnowledgeSyncService ── 事件总线（ai.kb.file.changed）               │
│         ├── MemorySyncService                                                 │
│         └── RuntimeLifecycle（ensure/resume/pause/destroy/reconcile）          │
│                                                                              │
│  AgentLoop：prepareRuntime → 注入文件路径提示 + VM 工具，移除 kb-*               │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ vm-runtime NAPI（HTTP + Bearer）
┌───────────────────────────────▼──────────────────────────────────────────────┐
│                  VentoAgentRuntime（Firecracker 宿主，可多台）                  │
│  /health  /info  /sandboxes  /sandboxes/{id}/commands  /files ...             │
│  guest: /workspace  /workspace/<session>/{knowledges,memories}  /root/.vento-agent  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 分层职责

- `RuntimeHostService`：宿主记录 CRUD、Token 加解密、安装命令生成、连接验证；只处理平台级数据。
- `RuntimeHostMonitor`：定时探活、拉取 `/sandboxes`、刷新用量、实例状态对账、状态迁移事件。
- `RuntimeCapacityService`：宿主容量、用户配额、资源预留、宿主选择、可用性查询。
- `RuntimeInstanceManager`：按 `(user,agent)` 幂等 ensure，恢复/暂停/销毁，补偿与孤儿对账。
- `KnowledgeSyncService`：知识库 manifest 差分、上传/删除、只读化、事件驱动增量。
- `MemorySyncService`：会话记忆单向镜像、全局记忆双向同步。
- `AgentLoop`：在 VM 模式下调用 `prepareRuntime`，拼装环境提示与工具，移除知识库工具。

---

## 6. 数据模型

> 所有表默认带 `created_at/updated_at`；时间使用 `TIMESTAMPTZ`。宿主表是**显式全局白名单**，不按租户隔离；其余表都带 `tenant_id` 并在 SQL 层强制过滤。

### 6.1 `ai_runtime_host`（全局）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | UUID |
| `name` | varchar(128) | 展示名 |
| `note` | varchar(500) | 备注 |
| `base_url` | varchar(512) NULL | 如 `http://10.0.0.12:8088` |
| `token_cipher` | text NULL | `ENC:` 加密后的 Bearer Token，永不出现在响应/日志 |
| `source` | varchar(16) | `manual` / `env`（兼容旧环境变量） |
| `source_key` | varchar(64) NULL | `env` 宿主的稳定键，防重复导入 |
| `status` | varchar(16) | `pending` / `online` / `offline` / `unauthorized` / `incompatible` / `disabled` |
| `enabled` | boolean | 管理员启停 |
| `version` | varchar(64) NULL | Runtime 版本 |
| `protocol_version` | varchar(64) NULL | 协议版本 |
| `cpu_total` / `memory_mb_total` / `disk_mb_total` | int | 宿主总容量（首次 verify 可由 `/info` 自动填充） |
| `max_sandboxes` | int | 最大沙箱数 |
| `reserved_cpu` / `reserved_memory_mb` / `reserved_disk_mb` | int default 0 | 给其他业务预留 |
| `usage_json` | jsonb | 最近一次 `/sandboxes` 汇总：`{count,running,cpu,memoryMb,diskMb,orphans}` |
| `reserved_inflight_cpu` / `..._memory_mb` / `..._disk_mb` | int default 0 | 调度中的临时预留 |
| `last_checked_at` / `last_online_at` | timestamptz | 探活 |
| `latency_ms` | int | 最近一次探活延迟 |
| `last_error` | text | 脱敏后的错误 |
| `created_by` | varchar(36) | 平台管理员 |

约束/索引：

- `UNIQUE (source_key) WHERE source_key IS NOT NULL`
- `UNIQUE (base_url) WHERE base_url IS NOT NULL`
- `INDEX (status, enabled)`

### 6.2 `ai_runtime_user_quota`（用户配额）

| 列 | 类型 | 说明 |
|---|---|---|
| `tenant_id` | varchar(36) | 现有安全作用域（内部字段） |
| `user_id` | varchar(36) | 用户 |
| `max_instances` | int default 0 | VM 数量上限；`0` = 不限制（当前默认） |
| `max_cpu` / `max_memory_mb` / `max_disk_mb` | int | 该用户全部 VM 的资源上限；`0` = 不限制 |
| `updated_by` | varchar(36) | 平台管理员 |

主键 `(tenant_id, user_id)`。缺省值来自环境变量（见 §14），无行时使用默认值；本期不提供配额管理 UI，管理员可直接改库或后续补页面。

### 6.3 `ai_agent_runtime`（每用户每 Agent 一台）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | 同时作为 Runtime 的 `sessionId`，避免泄露业务 ID |
| `tenant_id` | varchar(36) NOT NULL | 租户 |
| `agent_id` | varchar(36) NOT NULL | Agent |
| `user_id` | varchar(36) NOT NULL | 用户 |
| `host_id` | varchar(36) NOT NULL | FK `ai_runtime_host(id)` `ON DELETE RESTRICT` |
| `sandbox_id` | varchar(128) NULL | Runtime sandbox ID |
| `state` | varchar(16) | `provisioning/running/paused/stopped/failed/lost/destroyed` |
| `cpu_count` / `memory_mb` / `disk_mb` / `max_processes` | int | 创建时的资源规格 |
| `last_active_at` / `last_checked_at` | timestamptz | 生命周期 |
| `expires_at` | timestamptz NULL | Runtime 返回的过期时间，仅展示 |
| `last_global_memory_sync_at` | timestamptz | 记忆同步 |
| `last_workspace_sync_at` | timestamptz | 工作区备份同步 |
| `idle_notified_at` | timestamptz NULL | 15 天闲置提醒时间（防重复） |
| `stale_notified_at` | timestamptz NULL | 30 天平台管理员提醒时间（防重复） |
| `error` | text | 脱敏错误 |
| `created_at` / `updated_at` | timestamptz | |

约束：

- `UNIQUE (tenant_id, user_id, agent_id)`：保证一台。
- `UNIQUE (sandbox_id) WHERE sandbox_id IS NOT NULL`。
- `INDEX (tenant_id, state)`、`INDEX (host_id, state)`。
- Agent 删除使用 `ON DELETE RESTRICT`，由 service 先销毁实例再删 Agent，避免级联留下孤儿。

### 6.4 `ai_session_runtime`（会话与实例绑定 + 本次同步的知识库）

| 列 | 类型 | 说明 |
|---|---|---|
| `session_id` | varchar(64) PK | 对话会话 |
| `tenant_id` | varchar(36) NOT NULL | 租户 |
| `instance_id` | varchar(36) NOT NULL | FK `ai_agent_runtime(id)` `ON DELETE CASCADE` |
| `bound_kb_ids` | jsonb | 本次会话实际注入的知识库 ID 数组 |
| `kb_dirty` | boolean default false | 增量同步失败/暂停时置位，下次 ensure 重试 |
| `last_synced_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

索引：`INDEX (tenant_id, instance_id)`；`GIN (bound_kb_ids)`。

### 6.5 `ai_runtime_session_kb_file`（精准同步 manifest）

| 列 | 类型 | 说明 |
|---|---|---|
| `tenant_id` | varchar(36) | |
| `session_id` | varchar(64) | |
| `kb_id` | varchar(36) | |
| `path` | varchar(1024) | 相对知识库 `content/` 的路径 |
| `size` | bigint | |
| `mtime_ms` | bigint | 源文件 mtime（用于跳过 hash） |
| `sha256` | varchar(64) | 内容哈希 |
| `synced_at` | timestamptz | |

主键 `(tenant_id, session_id, kb_id, path)`；索引 `(tenant_id, kb_id)` 供事件反查。

> 可选优化（P1）：增加 `ai_kb_file` 作为知识库源文件哈希缓存，避免多会话重复计算；本期先按会话表 + 进程内缓存实现。

### 6.6 `ai_runtime_workspace_file`（工作区备份 manifest）

| 列 | 类型 | 说明 |
|---|---|---|
| `tenant_id` | varchar(36) | |
| `instance_id` | varchar(36) | FK `ai_agent_runtime(id)` `ON DELETE CASCADE` |
| `path` | varchar(1024) | `/workspace` 下的相对路径 |
| `size` | bigint | |
| `sha256` | varchar(64) | 内容哈希 |
| `backed_up_at` | timestamptz | |

主键 `(tenant_id, instance_id, path)`。备份文件落盘到 `{AI_STORAGE_PATH}/runtime-workspaces/{tenant}/{user}/{agent}/`。

同步范围与上限：

- 只同步 `/workspace` 下 Agent 自己产生的文件；
- 排除 `/workspace/{sid}/knowledges`、`/workspace/{sid}/memories`（派生数据）、`/workspace/.agent-logs`、`node_modules`、`.git`、`dist`、`build`、`target`、`.cache`、`*.tmp`；
- 单文件 ≤ 16 MiB，单实例 ≤ 2000 个文件 / 512 MiB；
- 释放 VM 前必须做一次最终同步；失败时提示“备份未完成”，允许用户确认强制释放。

### 6.7 旧字段处理

- `ai_agent.sandbox_id`：**停止读写**，保留一版用于清理旧 Agent 级 sandbox。新增一个平台管理员动作「清理遗留沙箱」，通过 Runtime `/sandboxes` 列出未被任何 `ai_agent_runtime` 引用的实例，人工确认后销毁。
- `memory.getSessionRuntimeSandbox`：保留方法兼容旧会话，但新流程不再使用；删除会话时不再销毁 sandbox。
- `ai_conversation` 表不再承担运行态。

---

## 7. 宿主接入流程

### 7.1 新增宿主（前端三步）

1. **基础信息**：名称、备注、内网监听地址（如 `10.0.0.12:8088`）、可选容量覆盖。
2. **执行命令**：后端生成一次性安装命令，包含新生成的 Bearer Token；前端展示复制按钮与安全提示（命令含凭据，勿外传）。
3. **连接验证**：填写 `baseUrl`（如 `http://10.0.0.12:8088`），点击「检测连接」；后端依次调用 `/health`、`/info`、`/sandboxes`，成功后宿主状态置 `online`，失败展示脱敏原因并允许重试。

创建宿主时先落库为 `pending`，Token 加密保存；命令只返回一次，之后任何列表/详情都不返回 Token。

### 7.2 安装命令

命令模板由 VentoStack 生成，脚本来自 VentoAgentRuntime 仓库/Release：

```bash
curl -fsSL '<VENTO_RUNTIME_INSTALLER_URL>' \
  | sudo bash -s -- \
      --token '<ONE_TIME_TOKEN>' \
      --listen '<HOST_IP>:8088' \
      --version '<PINNED_VERSION>'
```

安装脚本负责：

- 检查 Linux、`/dev/kvm`、cgroup v2、reflink 文件系统；
- 安装/校验 Firecracker、jailer、kernel、预构建 rootfs；
- 下载并校验 `vento-runtime-server`、`agentd`、`rootfs.ext4`、`vmlinux` 的 SHA256；
- 写 `/etc/vento/agent-runtime.json` 与 `/etc/vento/agent-runtime.env`（0600）；
- 创建 systemd 服务，仅监听指定内网地址，启动并等待 `/health` 返回 204；
- 输出版本与后续诊断命令。

`VENTO_RUNTIME_INSTALLER_URL` / `VENTO_RUNTIME_VERSION` 由环境变量配置，便于内网镜像与版本固定。

### 7.3 验证与状态

- `/health`：无鉴权，204 即服务存活。
- `/info`：Bearer 鉴权，返回 `{version, protocolVersion, host:{cpuCount,memoryMb,diskMb}, sandboxCount, runningCount, features}`；用于自动填充容量与版本兼容判断。
- `/sandboxes`：Bearer 鉴权，验证 Token 并返回实例清单。
- 状态映射：
  - 网络失败/超时 → `offline`
  - HTTP 401 → `unauthorized`
  - `/info` 版本低于最低兼容版本 → `incompatible`
  - `/info` 不存在（旧版本）→ `online`，`version=unknown`，在 UI 提示「建议升级」
  - 管理员停用 → `disabled`

### 7.4 旧环境变量兼容

`VENTO_RUNTIME_URL` + `VENTO_RUNTIME_TOKEN` 仍可用。AI 模块初始化时以 `source=env`、`source_key=default` 幂等导入为一条全局宿主记录（Token 同样加密）；管理页可看到但不可修改 URL/Token，只能停用。这样旧部署升级后无需手工迁移。

---

## 8. 实例生命周期

### 8.1 ensure（首次发消息）

```text
prepareRuntime(agent, tenant, user, session, kbIds, onProgress)
  ├─ agent.requires_virtual_environment? 否 → 返回 null
  ├─ 查 ai_agent_runtime (tenant, agent, user)
  │    ├─ 无：写 provisioning 行（id=instanceId，唯一约束）
  │    │      ├─ 检查用户资源上限（CPU / 内存 / 磁盘；VM 数量不设上限）
  │    │      ├─ RuntimeCapacityService.reserve(host, resources)
  │    │      ├─ createSandbox({sessionId: instanceId, resources, timeoutSeconds:86400, idleAction:'pause'})
  │    │      ├─ 更新 sandbox_id / host_id / state=running
  │    │      └─ 失败：state=failed，释放预留，补偿销毁
  │    └─ 有：
  │         ├─ 宿主 offline → 返回 RUNTIME_HOST_OFFLINE
  │         ├─ getSandbox:
  │         │    ├─ RUNNING → 直接复用
  │         │    ├─ PAUSED → resume
  │         │    ├─ STOPPED → start
  │         │    └─ FAILED/DESTROYED/缺失 → 销毁旧行并重建
  │         └─ 更新 state / last_active_at
  ├─ 若为新建/重建：WorkspaceBackupService.restore()  // 从上次备份恢复 /workspace
  ├─ KnowledgeSyncService.syncSession(kbIds)         // 失败 fail-closed
  ├─ MemorySyncService.pullSession() / pullGlobal()
  └─ 返回 { instanceId, sandboxId, promptBlock, tools }
```

并发控制：

- 先 `INSERT ... ON CONFLICT DO NOTHING` 抢占 instance 行；未抢到的请求轮询该行直到 `running` 或超时。
- 进程内再用 `Map<key, Promise>` 合并同一实例的并发 ensure。
- `provisioning` 行超过 2 分钟未完成 → 监控标记 `failed`，允许下次重建；Runtime 中同 `sessionId` 的孤儿由对账清理。

### 8.2 恢复与复用

- 同一用户同一 Agent 的所有会话共享 `/workspace`、`~/.vento-agent/memories`；不同会话只在 `/workspace/{sid}` 下隔离。
- API 响应永不返回 `sandbox_id`、宿主 `base_url`、Token；`agentCrudService.list` 继续剥离内部字段，`getById` 同步移除 `sandboxId`。
- 删除会话：只删除 `ai_session_runtime`、manifest、`/workspace/{sid}` 目录；**不销毁实例**。
- 暂停/停止：Runtime 空闲 pause；用户再次发消息自动 resume。
- Agent 关闭虚拟环境：设置开关为 false，已有实例 pause 但保留；提供「释放全部实例」动作。
- Agent 删除：先销毁该 Agent 的所有实例，再删 Agent 行；失败则中止删除，避免孤儿。
- 用户重置环境：先做最终工作区备份，再销毁重建，最后恢复备份；提示“系统安装的软件和运行中的进程会丢失，/workspace 文件会保留”。
- 宿主删除：有实例时 409；`force=true` 需要平台管理员二次确认，销毁该宿主上所有实例（不区分用户）。

### 8.3 闲置与保留

- 创建参数：`timeoutSeconds=86400`（Runtime 上限），`idleAction='pause'`。
- 不做自动 destroy；后台每日扫描：
  - `last_active_at > 15d` 且 `idle_notified_at IS NULL` → 站内信通知用户本人「你的 Agent X 虚拟机已闲置 15 天，可继续使用或手动释放」；
  - `last_active_at > 30d` 且 `stale_notified_at IS NULL` → 站内信通知平台管理员「某用户/Agent 的虚拟机已闲置 30 天，建议复核是否释放」；
  - 每个阈值只通知一次，用户重新活跃后可重置标记（或保留一次性通知，避免骚扰）。
- 资源不足时优先展示 `stale` 实例列表，管理员可一键释放；释放前先做最终工作区备份。
- 宿主故障：实例标 `lost`，宿主恢复后 reconcile；跨宿主迁移不在本期，UI 提供“在新宿主重建并恢复工作区备份”选项。

### 8.4 对账

每次监控周期：

1. `GET /sandboxes` 得到宿主上的全部实例。
2. 与本宿主的 `ai_agent_runtime` 对比：
   - DB 有、Runtime 无 → `lost`；
   - state 不一致 → 更新；
   - Runtime 有、DB 无 → 记为 orphan（只展示，不自动销毁）。
3. `sessionId` 等于 `ai_agent_runtime.id`，可用于匹配 `provisioning` 行。

### 8.5 工作区备份（释放前保底）

目标：释放/丢失 VM 后，用户重新创建时仍能拿回重要文件，把影响降到最低。

- 备份对象：`/workspace` 下 Agent 自己产生的文件；排除注入目录 `/workspace/{sid}/knowledges`、`/workspace/{sid}/memories`，以及 `.agent-logs`、`node_modules`、`.git`、`dist`、`build`、`target`、`.cache`、`*.tmp`。
- 备份位置：`{AI_STORAGE_PATH}/runtime-workspaces/{tenant}/{user}/{agent}/`，manifest 落 `ai_runtime_workspace_file`。
- 触发时机：
  - 每轮对话结束（`onRunFinished`）后异步增量同步；
  - 运行中的实例每 10 分钟一次（可配置，避免频繁 HTTP）；
  - 手动释放、用户重置、宿主删除强制释放之前同步执行最终备份；
  - 备份失败不阻断对话，但释放操作默认阻断，需用户显式确认“仍然释放”。
- 增量算法：远端 `find + sha256sum` 得到 manifest，与 DB 比较；只上传新增/变更，删除备份中已不存在于 VM 的文件（以 VM 为准）。
- 恢复：新建/重建实例后，在 Agent 首次使用前把备份文件上传回 `/workspace`；恢复完成后重新建立 manifest。
- 不保留：apt/pip/npm 安装的包、系统配置、运行中的进程、`/tmp`；这些在释放后视为丢失。

---

## 9. 知识库精准同步

### 9.1 目录布局

```text
/workspace/                              # 用户 + Agent 级持久工作区
/workspace/{session_id}/
  knowledges/                            # 只读
    INDEX.md                             # 知识库名称、ID、文件数、同步时间
    {kb_id}/                             # 稳定 ID，避免改名导致目录漂移
      .../relative/path.md
  memories/                              # 只读镜像
    MEMORY.md
    INDEX.md
/root/.vento-agent/memories/             # 全局记忆，可读写
  {title}.md
```

`~` 在 guest 内解析为 `/root`，`agentd` 与命令均以 root 运行，因此 `~/.vento-agent/memories` 是稳定路径。

### 9.2 源与有效文件集

- 源：`{AI_STORAGE_PATH}/knowledge-bases/{kbId}/content`。
- 只同步知识库服务对外暴露的文本文件（`.md` / `.txt`），不复制 `sources/` 原始二进制。
- 读取 `meta.json` 的 `disabledFiles` / `enabledFiles`，复用 `isEffectivelyDisabled` 规则：
  - 启用覆盖 > 显式禁用 > 祖先目录禁用；
  - 禁用文件不进入 VM；已存在的从 VM 删除。
- 路径校验：拒绝 `..`、NUL、绝对路径、符号链接；单文件大小上限 8 MiB；单 KB 文件数上限 5000（超出报错并提示拆分知识库）。

### 9.3 同步算法

```text
syncSession(kbIds):
  ensure dirs
  desired = scan source manifests (path,size,mtime,sha256,disabled)
  applied = SELECT * FROM ai_runtime_session_kb_file WHERE session_id=? AND kb_id=?
  for file in desired:
     if disabled: mark delete
     else if applied same sha256+size: skip
     else if applied same size+mtime: reuse applied.sha256 (仍可跳过 hash)
     else: compute sha256
  delete: applied - desired
  upload:
     mkdir -p parent
     write temp file (path + '.tmp.' + uuid)
     mv temp -> path
     chmod 0444 / dirs 0555
  upsert applied rows
  remove empty dirs
  write INDEX.md
```

- **原子性**：先写临时文件再 `mv`；避免 Agent 读到半文件。
- **增量**：事件只触发受影响 KB 的差分，不重建整个目录。
- **精准**：内容哈希而不是仅 mtime；mtime+size 相同才复用旧哈希。
- **纠偏**：Agent 若改写知识库文件，下一次差分会检测到并重新上传源内容；同步后 `chmod` 为只读。
- **失败策略**：会话首次同步失败 → 本轮对话 fail-closed（`KB_SYNC_FAILED`），避免无依据回答；增量同步失败 → 标记 `kb_dirty`，下一轮 ensure 重试，不打断当前运行。
- **并发**：每个 `(session_id, kb_id)` 串行；不同 KB 可并行（上限 4）。

### 9.4 事件驱动

在知识库路由的每个写操作后发事件：

| 操作 | 事件 |
|---|---|
| 新建/编辑文件 | `ai.kb.file.changed { tenantId, kbId, path, op:'upsert' }` |
| 删除文件 | `ai.kb.file.changed { ..., op:'delete' }` |
| 重命名 | `op:'delete'` 旧路径 + `op:'upsert'` 新路径 |
| 启用/禁用 | `op:'upsert'|'delete'` |
| 上传 | 每个解析产物 `op:'upsert'` |
| 知识库删除 | `ai.kb.deleted { tenantId, kbId }` |
| 元数据改名 | `ai.kb.meta.changed` |

`KnowledgeSyncService` 订阅事件：

1. 300ms 防抖合并同一 `(tenant,kb)` 的变更；
2. 查 `ai_session_runtime`（`bound_kb_ids @> kbId` 且实例存在）得到受影响会话；
3. 对运行中实例立即增量同步；暂停/停止实例标记 `kb_dirty`，下次 ensure 处理；
4. 知识库删除时移除所有会话下该 KB 目录与 manifest。

另外每 5 分钟做一次轻量对账（只扫描 DB 中 `kb_dirty=true` 或最近活跃的会话），修复事件丢失。

---

## 10. 记忆同步

### 10.1 会话记忆（只读镜像）

- 源：`{AI_STORAGE_PATH}/memories/{tenant}/users/{user}/sessions/{sessionId}/MEMORY.md`。
- 目标：`/workspace/{sessionId}/memories/MEMORY.md`。
- 时机：ensure、每轮开始前、记忆整理完成后。
- 只读：`chmod 0444`；Agent 若要更新会话记忆，使用现有 `memory-candidate` 工具，由 VentoStack 的记忆整理流程写回，避免与 Memory Agent 冲突。

### 10.2 全局记忆（双向）

- 源：`{AI_STORAGE_PATH}/memories/{tenant}/users/{user}/long-term/*.md`。
- 目标：`/root/.vento-agent/memories/*.md`。
- 拉取：ensure 时用远端 `find + sha256sum` 获取 manifest，只下载新增/变更文件；服务端新文件覆盖同名旧文件。
- 回写：每轮结束（`onRunFinished` 之后）扫描远端新增/变更的 `.md`：
  - 标题 = 文件名去 `.md` 并 decode；
  - 通过 `memory.createLongTermMemory/updateLongTermMemory` 写回；
  - 不因远端删除而删除服务端文件（避免误删）；
  - 单文件 1 MiB、单次 200 个文件上限；忽略隐藏文件和非 `.md`。
- 冲突：按文件 mtime 最后写入者胜；同一用户并发多 Agent 写同一文件时以最后完成为准，UI 不提供合并。
- 提示词要求 Agent 将全局性偏好/结论写入该目录，并给出 Markdown 标题格式。

### 10.3 Prompt 注入变化

VM 模式下不再把长期记忆/会话记忆全文拼进 system prompt（避免重复占 token），改为：

```text
## 本次会话的文件位置
- 知识库（只读）：/workspace/{sid}/knowledges
  - {kbName} ({kbId}) → /workspace/{sid}/knowledges/{kbId}
- 会话记忆（只读）：/workspace/{sid}/memories
- 全局记忆（可读写）：/root/.vento-agent/memories
```

非 VM Agent 保持现有 prompt 注入逻辑不变。

---

## 11. Agent 运行时集成

### 11.1 新增 `prepareRuntime` 依赖

在 `AgentLoopDeps` 中新增：

```ts
prepareRuntime?: (params: {
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  knowledgeBaseIds: string[];
  agentConfig: AgentConfig;
  signal?: AbortSignal;
}) => Promise<{
  instanceId: string;
  sandboxId: string;
  promptBlock: string;
  tools: AgentTool[];
} | null>;
```

`runStream` 在解析完 Agent 配置与有效知识库后调用：

- 若 Agent 未开启虚拟环境 → 返回 `null`，走现有逻辑。
- 先 `yield { type:'environment', phase:'preparing', message:'正在准备虚拟机环境…' }`；
- `await prepareRuntime(...)`；
- 成功后 `yield { type:'environment', phase:'ready', elapsedMs }`，追加 `promptBlock`，用返回的工具替换 `terminal/file_read/file_write`；
- 失败则 `yield { type:'error', error:{ code, message, recoverable:true } }` 并结束本轮。

`StreamChunk` 新增：

```ts
| { type: 'environment'; phase: 'preparing'|'ready'|'error'; message: string; elapsedMs?: number }
```

前端 `sse-client` 增加 `onEnvironment` 回调，聊天页展示等待状态与重试。

### 11.2 移除知识库工具

VM 模式下：

- `allowedTools` 过滤掉所有 `kb-*`；
- 不再自动追加 `kb-browse/kb-search/kb-read/kb-follow-link/kb-outline`；
- 不再拼接「知识库使用说明（kbId + kb-* 工具）」段落；
- 系统提示改为文件路径说明；
- 仍保留知识库绑定关系（用于同步，不用于工具）。

非 VM 模式完全保持现状。

### 11.3 工具定义

`createAgentRuntimeTools` 扩展：

| 工具 | 风险 | 审批 | 说明 |
|---|---|---|---|
| `terminal` | high | 是（默认 trust 自动放行） | 命令数组 + `timeoutMs`（默认 60s，上限 600s）+ `background`；输出上限 64 KiB；退出码放 details；危险命令硬阻断 |
| `file_read` | low | 否 | 允许读 `/workspace`、`/root/.vento-agent` |
| `file_write` | high | 是（默认 trust） | 允许写 `/workspace`、`/root/.vento-agent`；禁止写 `/workspace/{sid}/knowledges` 与 `/workspace/{sid}/memories` |
| `memory-candidate` | low | 否 | 保留，用于会话记忆候选 |

终端行为：

- 描述改为“在当前 Linux 环境中执行命令”，不出现 sandbox/远程字样；
- 默认 cwd `/workspace`，自动 `mkdir -p`；
- 命令用 `sh -lc` 执行，支持管道/重定向；`background=true` 时用 `nohup ... > /workspace/.agent-logs/{id}.log 2>&1 &` 并返回 PID/日志路径；
- 默认无外网：`curl` 可用但无法访问公网，不能 `apt/pip/npm install`；提示词明确告知，避免 Agent 反复尝试；
- 危险命令硬阻断（大小写/空白归一后匹配）：`rm -rf /`、`rm -rf /*`、`mkfs*`、`dd ... of=/dev/*`、`shutdown/reboot/poweroff/init`、`mount/umount /`、`chroot`、写 `/agentd`、写 `/proc/sys`、`chmod -R 777 /` 等；返回明确拒绝原因，不进入审批；
- 每条命令发审计事件：`{tenantId,userId,agentId,sessionId,instanceId,commandSummary,exitCode,durationMs}`，不记录完整输出与秘密。

### 11.4 默认运行模式

- Agent 开启虚拟环境时，聊天页默认 `runMode='trust'`，并在工具栏标注“虚拟机内自动执行；危险命令会被拒绝”。
- 用户可切换 `ask`（逐条审批）/`auto`（审批子智能体）。
- 服务端不信任前端：`authorizeToolCall` 仍按 `context.runMode` 执行；`terminal` 为 `high`，`trust` 放行、`ask` 人工、`auto` 判定；`critical` 仍强制人工（当前 VM 工具不设 critical）。

### 11.5 Shell 连续性与附件（P1）

- MVP 每条 `terminal` 命令以 `sh -lc` 在 `/workspace` 执行，`cd`/环境变量不跨调用保留；提示词要求使用绝对路径或 `cd dir && cmd`。这能覆盖绝大多数 Agent 用法。
- P1 可选：为每个实例维护持久 shell（需要额外预装 `tmux` 或自研 agentd shell 会话，会增加镜像体积）；命令通过唯一完成标记 + 输出捕获实现 `cd`/export/历史连续。需要处理超时、ANSI、并发锁与输出截断，单独做回归。
- 会话附件仍由 VentoStack 接收；P1 将附件复制到 `/workspace/{sid}/uploads`，VM 模式下移除 `read_document` 工具，统一用 `file_read`/`terminal` 读取。

### 11.6 系统提示

```text
## 运行环境
你运行在一台隔离的 Linux 机器中，工作目录 /workspace（持久保存，跨会话保留）。
基础镜像是 Debian 最新最小镜像，已预装 rg（ripgrep）和 curl；其余使用系统自带命令（bash/sh、grep、find、cat、sed、awk、head、tail、sort、uniq、xargs、tar 等）。
当前环境默认没有外网，不能安装新软件，请用现有命令完成任务。
探索文件时优先使用 rg，阅读用 cat / sed / head / tail；不要假设文件存在。

## 本次会话的文件位置
- 知识库（只读）：/workspace/{sid}/knowledges
  - {kbName}（{kbId}）→ /workspace/{sid}/knowledges/{kbId}
- 会话记忆（只读）：/workspace/{sid}/memories
- 全局记忆（可读写）：/root/.vento-agent/memories

## 工作方式
- 直接用 terminal 探索和操作；需要交付的文件写入 /workspace。
- 不要修改 /workspace/{sid}/knowledges 与 /workspace/{sid}/memories；不要访问其他会话目录。
- 会话记忆由系统维护；需要记录候选事实时使用 memory-candidate。
- 长期有效的偏好、结论、项目背景写入 /root/.vento-agent/memories/<主题>.md，使用 Markdown 标题。
- 命令输出过长时用 head/tail/rg -l 等收敛，避免一次读入超大文件。
- 运行中的服务/构建使用 background 参数，日志写入 /workspace/.agent-logs。
```

不出现 `sandboxId`、Runtime URL、Token、SSH 等字样。

---

## 12. 宿主管理 API

所有路由在 AI 模块内，`/api/ai/runtime-hosts`，使用 `authMiddleware` + `platformAdminMiddleware` + `perm('ai:runtime-host', action)`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/runtime-hosts` | 列表：状态、容量、用量、版本、延迟；支持 `status`/`keyword` 分页 |
| POST | `/api/ai/runtime-hosts` | 创建 pending 宿主，返回 `{id, installCommand, tokenExpiresAt}`，Token 只返回一次 |
| GET | `/api/ai/runtime-hosts/:id` | 详情（无 Token） |
| PUT | `/api/ai/runtime-hosts/:id` | 名称、备注、容量、预留、enabled |
| DELETE | `/api/ai/runtime-hosts/:id` | 有实例 409；`?force=true` 销毁全部实例（二次确认） |
| POST | `/api/ai/runtime-hosts/:id/verify` | body `{baseUrl}`；探活 + 校验 Token + 自动填容量；成功 online |
| POST | `/api/ai/runtime-hosts/:id/refresh` | 立即刷新一次状态与用量 |
| POST | `/api/ai/runtime-hosts/:id/rotate-token` | 重新生成 Token，状态回 pending，返回新安装命令 |
| GET | `/api/ai/runtime-hosts/:id/instances` | 实例列表（平台管理员，跨用户，带用户/Agent 标识） |
| GET | `/api/ai/runtime/availability` | 当前用户可用性：宿主数、剩余 CPU/内存/磁盘/槽位、用户资源上限、默认规格、`canManageHosts` |
| GET | `/api/ai/runtime/instances` | 当前用户的实例列表（不含 sandboxId/token） |
| POST | `/api/ai/runtime/instances/:id/pause` / `resume` / `destroy` | 实例所有者或平台管理员；按 `user_id` 过滤 |
| POST | `/api/ai/agents/:id/runtime/ensure` | 当前用户确保实例（预热点，可选） |
| GET | `/api/ai/agents/:id/runtime` | 当前用户该 Agent 的实例状态、路径、最后活跃时间、备份状态 |
| POST | `/api/ai/agents/:id/runtime/reset` | 当前用户重置环境（备份后销毁重建，二次确认） |

安全要点：

- `userId` 一律取 `ctx.user.id`；实例查询/操作必须带 `user_id`（`tenant_id` 作为内部作用域一并带上），跨用户统一 404。
- 宿主列表/详情/安装命令/全量实例列表只对平台管理员开放。
- 普通用户只能看到/操作自己的实例；不提供租户级实例列表或租户配额。
- Token 不出现在任何响应、日志、错误、OpenAPI 示例中。
- `baseUrl` 校验：仅 `http/https`，禁止 userinfo/片段/重定向；禁止 `169.254.0.0/16`、`fd00:ec2::254`、`0.0.0.0`、组播/保留地址；私网地址允许（宿主通常在内网）。
- 宿主验证/监控使用短超时 `fetch`（3–5s），不让 60s 的 NAPI 请求拖住管理页。
- 所有写操作审计；删除/强制销毁需要二次确认。

---

## 13. 资源评估与调度

### 13.1 容量来源

- 宿主总容量：首次 verify 由 `/info` 自动填充；管理员可覆盖并设置 `reserved_*`。
- 运行时用量：`/sandboxes` 返回每个 sandbox 的 `resources` 与 state。
  - CPU/内存按 `running` 计；
  - 磁盘按所有非 `destroyed` 计（paused/stopped 仍占磁盘）。
- 调度中预留：`reserved_inflight_*` 在 `reserve` 时原子增加，创建结束/失败后释放。

### 13.2 可用性计算

```text
hostAvailableCpu   = cpu_total - reserved_cpu - runningCpu - inflightCpu
hostAvailableMem   = memory_mb_total - reserved_memory_mb - runningMem - inflightMem
hostAvailableDisk  = disk_mb_total - reserved_disk_mb - usedDisk - inflightDisk
hostAvailableSlots = max_sandboxes - sandboxCount - inflightSlots

userAvailable = min(host 合计可用, 用户配额 - 用户已用)
```

用户资源上限只限制「该用户全部 Agent VM 的合计 CPU/内存/磁盘」，不限制 VM 数量；宿主容量仍是全局硬约束。

### 13.3 选择策略

1. 过滤 `enabled && status=online && version compatible`。
2. 过滤满足默认规格（CPU/内存/磁盘/槽位）。
3. 按「剩余资源足够且最小」best-fit 排序，减少碎片；同分按最近用量低优先。
4. 事务内 `UPDATE ... WHERE available >= required` 预留；失败重试下一台。
5. 无可用宿主 → 409/503，`details.reason` 区分：
   - `no_online_host`
   - `host_capacity_exhausted`
   - `user_resource_limit_exceeded`
6. UI 提示：
   - 平台管理员：新增宿主 / 释放旧实例（跳转虚拟机页）；
   - 普通用户：释放自己不再使用的 Agent 环境；仍然不足时联系平台管理员扩容。

### 13.4 默认规格

- 每实例：`cpuCount=2`、`memoryMb=4096`、`diskMb=8192`、`maxProcesses=512`。
- `maxProcesses` 是**单 VM 的安全上限**（防止 fork bomb / 进程耗尽宿主），不是租户或用户配额；可按需调到 1024/2048，不建议关闭。
- 可通过 Agent `config.runtime.resources` 覆盖，但必须在宿主容量与用户配额内。
- 阈值告警：宿主 CPU/内存/磁盘 >80% 黄色、>95% 红色；用户配额 >80% 提示。

---

## 14. 配置项

```dotenv
# 兼容旧配置：作为 source=env 的默认宿主导入
VENTO_RUNTIME_URL=http://10.0.0.12:8088
VENTO_RUNTIME_TOKEN=<runtime bearer token>
VENTO_RUNTIME_TIMEOUT_MS=30000

# 宿主安装
VENTO_RUNTIME_INSTALLER_URL=https://github.com/Ventorium/VentoAgentRuntime/releases/download/v0.1.0/install-host.sh
VENTO_RUNTIME_VERSION=0.1.0
VENTO_RUNTIME_MIN_PROTOCOL=1

# 监控
AI_RUNTIME_HOST_CHECK_INTERVAL_MS=30000
AI_RUNTIME_HOST_CHECK_TIMEOUT_MS=5000

# 默认规格
AI_RUNTIME_VM_CPU=2
AI_RUNTIME_VM_MEMORY_MB=4096
AI_RUNTIME_VM_DISK_MB=8192
AI_RUNTIME_VM_MAX_PROCESSES=512
AI_RUNTIME_VM_TIMEOUT_SECONDS=86400

# 用户资源上限（不做租户级限制；VM 数量默认不限制）
AI_RUNTIME_USER_MAX_INSTANCES=0
AI_RUNTIME_USER_MAX_CPU=10
AI_RUNTIME_USER_MAX_MEMORY_MB=20480
AI_RUNTIME_USER_MAX_DISK_MB=40960

# 闲置提醒（不做自动销毁）
AI_RUNTIME_IDLE_NOTIFY_DAYS=15
AI_RUNTIME_STALE_NOTIFY_DAYS=30

# 工作区备份
AI_RUNTIME_WORKSPACE_BACKUP_ENABLED=true
AI_RUNTIME_WORKSPACE_BACKUP_INTERVAL_MS=600000
AI_RUNTIME_WORKSPACE_MAX_FILE_MB=16
AI_RUNTIME_WORKSPACE_MAX_FILES=2000
AI_RUNTIME_WORKSPACE_MAX_TOTAL_MB=512
```

---

## 15. VentoAgentRuntime 侧改造

### 15.1 协议路径策略

当前 `crates/agent-protocol/src/lib.rs::validate_guest_path` 只允许：

- 写：`/workspace`、`/tmp`
- 读：`/workspace`、`/knowledge`、`/tmp`

需要扩展（保持根路径最小化）：

- `/workspace` 的读写原本已允许，知识库/会话记忆直接放在 `/workspace/{session_id}` 下，不再需要新增 `/chat` 根路径。
- 只新增 `~/.vento-agent`（即 `/root/.vento-agent/`）的读写权限，用于全局记忆。
- 保留 `/knowledge` 只读（旧能力兼容）。

> 说明：宿主 Token 本来就能通过 `/commands` 执行任意命令，路径白名单是纵深防御；扩展后仍禁止 `/etc`、`/proc`、`/agentd` 等系统路径。Agent 通过 shell 仍以 root 运行，因此“知识库只读”是逻辑约束 + 定期纠偏，不是内核级强制；后续可考虑非 root 用户 + 只读挂载。

### 15.2 `/info`

新增 Bearer 鉴权接口：

```json
{
  "version": "0.1.0",
  "protocolVersion": 1,
  "host": { "cpuCount": 16, "memoryMb": 65536, "diskMb": 524288 },
  "sandboxCount": 3,
  "runningCount": 2,
  "features": ["vsock", "reflink", "snapshot"],
  "dataDir": "/var/lib/vento/runtime"
}
```

`/health` 保持无鉴权 204。

### 15.3 安装脚本与发布产物

- `scripts/install-host.sh`：一键安装/升级，参数 `--token`、`--listen`、`--version`、`--data-dir`、`--mirror`。
- `scripts/build-rootfs.sh`：构建 Debian 最小 rootfs（仅 rg/curl + 基础命令），产出 ext4（本地/CI 用）。
- Release workflow 增加：
  - `vento-runtime-server-<target>`
  - `vento-agentd-<target>`
  - `vento-rootfs-<version>.ext4.zst`
  - `vmlinux-<version>.bin`
  - `install-host.sh`
  - `SHA256SUMS`
- 版本固定，安装脚本校验 SHA256；禁止 `curl | bash` 后再动态执行未校验内容。

### 15.4 基础镜像

用户确认：使用 **Debian 最新的最小镜像**（`debian:stable-slim`，按 digest 固定），只预装：

- `ripgrep`（提供 `rg`）
- `curl`（含 `ca-certificates` 依赖）
- Debian 自带的基础命令：`bash/sh`、`grep`、`find`、`cat`、`sed`、`awk`、`head`、`tail`、`sort`、`uniq`、`xargs`、`tar`、`gzip` 等

不预装：`fd`、`bat`、`jq`、`git`、`python3`、`node`、`npm`、`gcc`、`tmux` 等。

目录初始化：`/workspace`、`/root/.vento-agent/memories`。

镜像构建一次，创建沙箱走 reflink 克隆，工具无需在每次创建时安装。若后续 Agent 需要编译/运行时，再单独评估镜像分层或按宿主提供不同 template。

---

## 16. 前端设计

### 16.1 「虚拟机接入」Tab

位置：`apps/admin/web/src/pages/app/ai/capabilities/index.tsx` 新增 tab `runtime`，组件拆到 `components/runtime-tab.tsx`。

- 顶部：宿主总数/在线数、总容量、已用、告警条、刷新按钮。
- 宿主表格/卡片：
  - 名称、状态 Tag（在线/离线/待接入/鉴权失败/版本不兼容/已停用）
  - baseUrl、版本、延迟、最后检测
  - CPU/内存/磁盘/槽位进度条
  - 实例数（运行/暂停/孤儿）
  - 操作：验证、刷新、编辑、停用、删除
- 新增宿主 Modal（三步）：
  1. 基础信息（名称、备注、监听地址、容量覆盖）
  2. 安装命令（代码块 + 复制 + 安全提示）
  3. 连接验证（baseUrl + 检测按钮 + 结果）
- 宿主详情 Drawer：容量明细、实例列表（用户/Agent/状态/规格/最后活跃/备份状态）、暂停/恢复/销毁、孤儿清理。
- 状态轮询：15s；页面隐藏时暂停；避免并发请求。
- 非平台管理员：不显示该 Tab（由 `availability.canManageHosts` 控制），或显示无权限占位。

### 16.2 Agent 编辑弹窗

- 虚拟环境开关在 create/edit 均可用（去掉“创建后不可修改”）。
- 打开时请求 `GET /api/ai/runtime/availability`：
  - 显示“可用宿主 2 台，剩余 12 vCPU / 32 GB / 80 GB / 8 槽位”；
  - 不可用则禁用开关并展示原因与建议。
- 开启后：
  - 工具面板隐藏 `kb-*`，默认勾选 `terminal`、`file_read`、`file_write`；
  - 提示“知识库将以只读目录注入，不再使用 kb-* 工具”；
  - 显示默认规格与预计资源占用。
- 编辑时关闭开关：提示“已有 N 台环境会暂停保留，可在虚拟机页释放”，不立即销毁。
- 保存时后端再次校验容量；失败则回滚开关并提示。

### 16.3 对话页

- 选中 VM Agent 时：
  - 默认 `runMode='trust'`，工具栏标注“虚拟机内自动执行”；
  - 标签显示当前用户该 Agent 的实例状态（准备中/运行中/已暂停/不可用）。
- 发送首条消息后：
  - 收到 `environment:preparing` → 显示“正在准备虚拟机环境…（首次可能 5–15 秒）”；
  - `environment:ready` → 显示“环境已就绪”并消失；
  - `environment:error` → 红色提示 + “重试”按钮（重新发送）。
- 工具块 `terminal` 展示命令摘要、退出码、耗时；输出过长时折叠。
- 错误信息脱敏，不展示 Runtime URL/Token。

### 16.4 类型生成

- 后端路由使用 `routeDoc` 补全 OpenAPI。
- 启动 Admin API 后执行 `bun run --cwd apps/admin/web gen:sdk` 重新生成 `src/api/schema.ts`；业务类型从 `@/api/types` 派生，禁止手写新接口。

---

## 17. 安全与审计

### 17.1 信任边界

- 浏览器 → Admin API：认证、平台管理员权限、用户过滤。
- Admin API → Runtime：Bearer Token（加密存储）、SSRF 校验、短超时。
- Runtime → Firecracker guest：KVM 隔离、无网络、rootfs + 独立 rootfs 盘。
- Guest → VentoStack：不可信输入（Agent 命令、写出的文件、知识库内容）。知识库/RAG 内容视为不可信，提示词不因文件内容改变系统边界。

### 17.2 关键控制

- 宿主 Token：AES-GCM 加密存储，只写不读；创建/轮换时一次性返回；日志/错误/OpenAPI 不出现。
- 跨用户：所有实例/会话/文件操作以 `user_id` 为 SQL 条件（`tenant_id` 作为内部作用域一并带上）；跨用户统一 404。
- 平台管理员：`platformAdminMiddleware`（数据库实时校验 admin），不是只看 JWT。
- SSRF：scheme/端口/地址校验、禁止重定向、短超时；平台管理员操作也校验。
- 命令执行：默认 trust + 危险命令阻断 + 审计；用户可切 ask；`critical` 仍人工。
- 知识库注入：路径穿越/NUL/符号链接/大小/数量限制；内容不拼进 system prompt。
- 资源耗尽：用户配额 + 宿主容量 + 单文件/总文件数限制 + 命令超时/输出上限 + 每 VM 进程上限。
- 审计事件：宿主 CRUD/验证/轮换、实例创建/恢复/销毁、命令执行摘要、同步失败、容量拒绝。
- 不记录：Token、完整命令输出、知识库正文、记忆正文。

### 17.3 已知残余风险

- Guest 内 Agent 以 root 运行，`knowledges` 的只读是逻辑约束；恶意 Agent 可 `chmod`/改写，下一次同步会纠正，但窗口内可能读到被篡改内容。缓解：提示词 + 工具层禁止写 + 同步纠偏；后续可评估非 root + 只读挂载。
- 共享宿主上 Runtime Token 可访问所有沙箱；VentoStack 通过实例表做用户映射，但 Token 泄露的爆炸半径是整台宿主。缓解：Token 加密、最小权限、轮换、宿主网络隔离。
- 无公网：Agent 无法 `apt install`/`pip install`/访问外部 API；必须预装工具。若业务需要联网，需要 Runtime 增加受控网络能力，属后续安全评审项。
- 多活部署下监控重复执行、ensure 竞争：DB 唯一约束 + 对账兜底；极端情况可能短暂创建两个沙箱，由 orphan 清理。
- 跨宿主实时迁移不支持；宿主故障时可用工作区备份在新宿主重建，但系统安装的软件、后台进程和 `/tmp` 不恢复。

---

## 18. 实施计划

### Phase 0：Runtime 基础能力（可并行）

- [ ] `validate_guest_path` 只新增 `/root/.vento-agent` 读写（`/workspace` 原本已允许），补测试。
- [ ] `/info` 接口 + 测试。
- [ ] `scripts/install-host.sh` + `scripts/build-rootfs.sh` + shellcheck。
- [ ] Release workflow 发布 server/agentd/rootfs/vmlinux/SHA256SUMS。
- [ ] 基础镜像改为 Debian 最新最小镜像，仅预装 `ripgrep`、`curl`；初始化 `/workspace`、`/root/.vento-agent`。
- [ ] 可选预热：宿主首次接入时创建一个基准沙箱并生成模板快照，后续创建优先用 `snapshotId`；若收益不明显则保持 reflink 克隆。
- [ ] 文档更新 `docs/remote-agent-runtime.md`。

### Phase 1：宿主管理与监控（VentoStack 后端）

- [ ] 迁移 `021_create_ai_runtime_tables`：host / user_quota / instance / session_runtime / kb_file / workspace_file。
- [ ] 模型、`RuntimeHostService`、`RuntimeHostMonitor`、`RuntimeCapacityService`。
- [ ] `routes/runtime-host.ts` + `module.ts` 合并路由 + OpenAPI。
- [ ] 平台管理员中间件注入（`AIModuleDeps` / boot / admin app）；`AIModule.shutdown()` 停止监控，boot 的 `shutdown()` 调用 AI 模块；system 未启用时宿主管理 fail-closed。
- [ ] 环境变量宿主导入、配置项、`.env.example`。
- [ ] 站内信通知注入（15 天用户 / 30 天平台管理员），`AIModuleDeps` 增加 notify 回调。
- [ ] 权限 seed：`ai:runtime-host:*` + 能力页按钮权限。
- [ ] 宿主 CRUD / verify / refresh / rotate / instances / availability 测试。
- [ ] 监控单测（fake runtime/clock）+ 状态迁移 + 用量汇总。

### Phase 2：实例与生命周期

- [ ] `RuntimeInstanceManager`：ensure/resume/pause/destroy/reconcile、并发抢占、补偿。
- [ ] `AgentRuntimeClient` 扩展：list/start/pause/resume/stop/listDir/remove/kill、resources/timeout、`/info`。
- [ ] Agent service 改造：创建不再建 sandbox；编辑允许开关；删除销毁所有实例；容量校验。
- [ ] 会话删除不再销毁实例；`ai_session_runtime` 清理。
- [ ] 旧 `ai_agent.sandbox_id` 遗留清理动作。
- [ ] 用户配额与资源预留测试。
- [ ] 实例 API（当前用户列表/暂停/恢复/销毁/重置）。

### Phase 3：知识库/记忆同步与 Agent 集成

- [ ] 知识库路由写操作发事件；`KnowledgeSyncService` 订阅、防抖、增量、纠偏。
- [ ] `KnowledgeBaseService` 增加 sync manifest 辅助（或内部遍历）。
- [ ] `MemorySyncService`：会话镜像 + 全局双向 + 回合回写。
- [ ] `WorkspaceBackupService`：`/workspace` 增量备份、释放前最终同步、重建恢复、大小/数量限制。
- [ ] 闲置提醒任务：15 天用户站内信、30 天平台管理员站内信，幂等标记。
- [ ] `AgentLoop`：`prepareRuntime`、`environment` chunk、移除 `kb-*`、prompt 替换、默认 trust。
- [ ] `createAgentRuntimeTools`：路径白名单、输出上限、超时、background、危险命令阻断、审计。
- [ ] `StreamChunk` / `sse-client` / 聊天页等待提示。
- [ ] 知识库同步单测（新增/修改/删除/禁用/重命名/重建/失败重试）+ 集成测试。

### Phase 4：前端

- [ ] 虚拟机接入 Tab + 新增三步 Modal + 详情 Drawer + 实例列表。
- [ ] Agent 弹窗开关 + 可用性 + 工具过滤 + 关闭提示。
- [ ] 对话页默认 trust / 状态标签 / 环境准备提示 / 重试。
- [ ] 权限隐藏、空态、错误提示、移动端布局。
- [ ] `gen:sdk` 更新 `schema.ts` / `types.ts`；补充前端测试。

### Phase 5：文档、审计与验收

- [ ] `apps/docs` 平台/Admin 文档；AI README 重写。
- [ ] 审计事件与日志脱敏检查。
- [ ] 安全审查（SSRF、跨用户、Token、命令、路径、配额、备份）。
- [ ] 全量 `bun test`、`bun run typecheck`、`bunx biome check`、前端 build。
- [ ] 真实宿主 E2E：新增宿主 → 安装 → 验证 → Agent 开启 → 首聊 → 暂停/恢复 → 知识库热更新 → 释放 → 重建恢复工作区。

---

## 19. 测试与验收

### 19.1 自动化测试

- **单元**
  - 宿主 CRUD/Token 加密/平台权限/用户过滤。
  - 监控状态机（online/offline/unauthorized/incompatible/disabled）、用量汇总、实例对账。
  - 容量计算、best-fit、预留回滚、用户资源上限；VM 数量不设上限。
  - ensure 幂等、并发抢占、创建失败补偿、状态恢复。
  - KB 差分（新增/修改/删除/禁用/重命名/哈希相同/大文件/路径穿越）。
  - 全局记忆双向、冲突、大小/数量上限。
  - 工作区备份增量/排除目录/释放前最终同步/重建恢复/超限。
  - 工具路径白名单、危险命令阻断、输出截断、审计事件。
  - Prompt 不含 sandboxId/URL/Token，VM Agent 不含 `kb-*`。
- **HTTP 集成**
  - 宿主端点：平台管理员成功、普通用户 403、跨用户 404、Token 不返回。
  - Agent 开关：无容量 409、开启成功、关闭保留实例。
  - 实例端点：本人可见、他人 404、暂停/恢复/销毁。
  - SSE：environment chunk 顺序、错误 chunk、首聊等待。
- **回归**
  - 非 VM Agent 的 KB 工具、prompt、聊天行为不变。
  - 旧环境变量单宿主模式可启动并工作。
  - 删除会话不销毁共享 VM。

### 19.2 验收标准

- [ ] 平台管理员可在虚拟机 Tab 新增宿主，复制命令，在 Linux/KVM 宿主机执行后，点击检测变为在线。
- [ ] 宿主离线/Token 错误/版本不兼容在 60s 内反映在列表。
- [ ] 无可用宿主或用户配额不足时，Agent 开关被阻止并给出明确原因。
- [ ] 同一用户同一 Agent 的多个会话共享 `/workspace`，不同用户/Agent 互相不可见。
- [ ] VM Agent 的工具列表中没有 `kb-*`；系统提示包含 `/workspace/{sid}/knowledges` 等路径。
- [ ] 知识库页面新增/修改/禁用/删除文件后，活跃会话目录在 2s 内增量更新；停用的文件不存在。
- [ ] Agent 在 VM 内 `rg`、`curl`、`grep`、`find`、`cat` 可用；`terminal` 默认自动执行，危险命令被拒绝并审计。
- [ ] 首聊显示环境准备提示；准备完成后正常对话；失败可重试。
- [ ] 会话记忆只读镜像；Agent 写入全局记忆后，长期记忆可在其他会话/Agent 读到。
- [ ] 闲置 VM 只暂停不销毁；15 天用户收到站内信、30 天平台管理员收到站内信；管理员可手动释放。
- [ ] 宿主删除/Agent 删除/会话删除不会留下未处理的实例或误删共享实例。
- [ ] 释放后重建能恢复 `/workspace` 备份文件；系统安装软件不恢复的行为有明确提示。
- [ ] 所有新增 HTTP 端点有用户隔离、权限、失败路径测试；全量测试与类型检查通过。

---

## 20. 代码落点清单

### VentoStack

- `packages/framework/ai/src/migrations/021_create_ai_runtime_tables.ts`
- `packages/framework/ai/src/models/runtime.ts`
- `packages/framework/ai/src/services/runtime-host.ts`
- `packages/framework/ai/src/services/runtime-monitor.ts`
- `packages/framework/ai/src/services/runtime-capacity.ts`
- `packages/framework/ai/src/services/runtime-instance.ts`
- `packages/framework/ai/src/services/knowledge-sync.ts`
- `packages/framework/ai/src/services/memory-sync.ts`
- `packages/framework/ai/src/services/workspace-backup.ts`
- `packages/framework/ai/src/services/runtime-notifier.ts`
- `packages/framework/ai/src/routes/runtime-host.ts`
- `packages/framework/ai/src/agent-runtime/client.ts`
- `packages/framework/ai/src/agent-runtime/tools.ts`
- `packages/framework/ai/src/agent-runtime/types.ts`
- `packages/framework/ai/src/agent-engine/agent-loop.ts`
- `packages/framework/ai/src/llm-gateway/types.ts`
- `packages/framework/ai/src/services/agent.ts`
- `packages/framework/ai/src/routes/agent.ts`
- `packages/framework/ai/src/routes/knowledge-base.ts`
- `packages/framework/ai/src/routes/chat.ts`
- `packages/framework/ai/src/module.ts`
- `packages/framework/ai/src/index.ts`
- `packages/platform/boot/src/create-platform.ts`（注入平台管理员中间件 / runtime 配置）
- `apps/admin/api/src/app.ts`
- `apps/admin/api/src/config/index.ts`
- `apps/admin/api/src/database/migrations.ts`
- `apps/admin/api/src/database/seeds/014_ai_runtime_permissions.ts`
- `apps/admin/api/src/database/seeds.ts`
- `apps/admin/web/src/pages/app/ai/capabilities/index.tsx`
- `apps/admin/web/src/pages/app/ai/capabilities/components/runtime-tab.tsx`
- `apps/admin/web/src/pages/app/ai/capabilities/components/runtime-host-modal.tsx`
- `apps/admin/web/src/pages/app/ai/capabilities/components/runtime-host-drawer.tsx`
- `apps/admin/web/src/pages/app/ai/agents/index.tsx`
- `apps/admin/web/src/pages/app/ai/agents/mutation.ts`
- `apps/admin/web/src/pages/app/ai/chat/[agentId]/index.tsx`
- `apps/admin/web/src/pages/app/ai/chat/components/TopToolbar.tsx`
- `apps/admin/web/src/api/sse-client.ts`
- `apps/admin/web/src/api/schema.ts`（生成）
- `apps/admin/web/src/api/types.ts`
- `apps/docs/src/content/docs/platform/ai-agent-runtime.md`
- `.env.example`
- `packages/framework/ai/README.md`

### VentoAgentRuntime

- `crates/agent-protocol/src/lib.rs`
- `bins/vento-runtime-server/src/main.rs`
- `images/debian-slim/Dockerfile`
- `scripts/install-host.sh`
- `scripts/build-rootfs.sh`
- `.github/workflows/release.yml`
- `docs/remote-agent-runtime.md`

---

## 21. 风险与后续

| 风险 | 缓解 |
|---|---|
| Runtime 无公网，工具必须预装 | 发布固定 rootfs；宿主 verify 检查工具；文档明确 |
| Guest root 可改只读知识库 | 工具层禁止 + 同步纠偏 + 提示；后续非 root/只读挂载 |
| 宿主 Token 爆炸半径大 | 加密、最小暴露、轮换、宿主网络隔离、审计 |
| 跨宿主迁移缺失 | 本期提供“重建”，后续 snapshot 备份/迁移 |
| 多活部署并发 | DB 唯一约束 + 对账 + orphan 清理；后续引入分布式锁 |
| 旧数据/旧 sandbox | 停止写 `ai_agent.sandbox_id`；提供遗留清理动作 |
| 前端类型生成依赖在线 API | 先完成后端 OpenAPI，再启动 API 生成；无 DB 时手写类型仅作临时，不合并 |

### 待评审确认

1. 默认每实例规格（2 vCPU / 4 GB / 8 GB）是否符合目标宿主容量。
2. 用户默认配额（5 台 / 10 vCPU / 20 GB 内存 / 40 GB 磁盘）是否合适。
3. 工作区备份默认上限（单文件 16 MiB、2000 文件、512 MiB）是否合适。
4. 15 天/30 天站内信的具体文案与跳转链接（建议跳到该 Agent 的对话页或虚拟机详情）。
