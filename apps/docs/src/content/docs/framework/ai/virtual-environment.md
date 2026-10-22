---
title: Agent 虚拟机环境
description: 宿主接入、用户级 VM 生命周期、知识库/记忆/工作区同步
---

## 总体流程

1. 平台管理员在 **AI 能力 / 虚拟机接入** 新增宿主，复制一次性安装命令到 Linux/KVM 宿主机执行。
2. 服务启动后回填可访问地址，点击「检测连接」；VentoStack 通过 `/health`、`/info`、`/sandboxes` 验证并读取容量。
3. 在 Agent 编辑弹窗开启「虚拟环境」；保存时只校验在线宿主与用户资源上限，不预创建。
4. 该用户首次发消息时创建 `(tenant_id, user_id, agent_id)` 唯一的 VM；后续会话复用。
5. 会话结束/释放前，把 `/workspace` 重要文件与 `~/.vento-agent/memories` 同步回 VentoStack。

## Agent 可见目录

```text
/workspace/                              # 用户 + Agent 级持久工作区
/workspace/{session_id}/knowledges/      # 只读知识库
/workspace/{session_id}/memories/        # 只读会话记忆
/root/.vento-agent/memories/             # 全局记忆（读写）
```

VM Agent 不再获得 `kb-*` 工具，改为使用 `terminal` / `file_read` / `file_write`，
通过 `rg`、`grep`、`find`、`cat`、`sed`、`awk` 等命令探索。基础镜像只预装 `rg` 与 `curl`，
默认无外网。

## 资源与生命周期

- 单 VM 默认：2 vCPU / 4 GB / 8 GB 磁盘 / 512 进程。
- 用户资源上限：默认 10 vCPU / 20 GB 内存 / 40 GB 磁盘；**不限制 VM 数量**（0 = 不限制）。
- 空闲只 `pause`，不自动销毁；闲置 15 天站内信通知用户，30 天通知平台管理员。
- 工作区文件增量备份到 `{AI_STORAGE_PATH}/runtime-workspaces/`，重建时恢复；
  系统安装的软件、后台进程和 `/tmp` 不保留。

## 安全

- 宿主 Token AES-GCM 加密存储，只在创建/轮换时返回一次。
- `/workspace/{sid}/knowledges` 与 `memories` 逻辑只读，工具层禁止写入；同步时纠偏。
- VM 内默认信任执行命令，但 `rm -rf /`、`mkfs`、`dd` 写块设备、关机等被硬阻断并审计。
- 宿主地址校验禁止云元数据/链路本地地址与重定向。
