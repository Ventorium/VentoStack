---
name: ventostack-skills-index
description: |
  VentoStack Agent Skills 索引。AI 工具（Claude Code / Codex）在操作本项目时，
  根据当前任务类型选择对应的 skill 文件遵循。
---

# VentoStack Agent Skills 索引

## 如何使用

1. 确定当前任务涉及的模块层级
2. 选择对应的 skill 文件
3. 同时参考 `project-conventions.md` 全局约定
4. 安全相关任务必须额外参考 `security-review.md`

## Skill 文件列表

| Skill | 文件 | 适用场景 |
|-------|------|----------|
| **project-conventions** | `project-conventions.md` | 所有任务，全局命名/类型/测试/Git/文档约定 |
| **framework-core** | `framework-core.md` | 修改 `packages/framework/core` 路由/中间件/Context/错误/生命周期 |
| **framework-database** | `framework-database.md` | 修改 `packages/framework/database` 模型/查询/迁移/事务 |
| **framework-cache-events** | `framework-cache-events.md` | 修改 `packages/framework/cache` 或 `packages/framework/events` |
| **platform-module-dev** | `platform-module-dev.md` | 新增或修改 `packages/platform/*` 平台模块 |
| **admin-backend-api** | `admin-backend-api.md` | 修改 `apps/admin/api` 后端装配/配置/迁移 |
| **admin-frontend** | `admin-frontend.md` | 修改 `apps/admin/web` 前端页面/组件/Hooks |
| **security-review** | `security-review.md` | 安全审查、合并前复查、架构评审 |

## 快速决策树

```
任务类型?
├── 框架层开发（core/database/cache/events/observability/openapi/testing/webhook/cli）
│   ├── core → framework-core.md + project-conventions.md
│   ├── database → framework-database.md + project-conventions.md
│   └── cache/events → framework-cache-events.md + project-conventions.md
├── 平台层开发（auth/system/oss/scheduler/workflow/...）
│   └── platform-module-dev.md + project-conventions.md
│   └── 涉及安全 → + security-review.md
├── Admin 后端开发（apps/admin/api）
│   └── admin-backend-api.md + project-conventions.md
│   └── 涉及安全 → + security-review.md
├── Admin 前端开发（apps/admin/web）
│   └── admin-frontend.md + project-conventions.md
├── 安全审查 / 合并前复查
│   └── security-review.md + 相关模块 skill
└── 文档更新
    └── project-conventions.md 中的文档规范
```

## 与现有 .claude/skills 的关系

本项目同时存在 `.claude/skills/`（Claude Code 原生 skill）和 `.agents/skills/`（通用 Agent skill）。

- `.claude/skills/`：面向 Claude Code 的详细流程文档（如 admin-backend-entity、admin-crud-page）
- `.agents/skills/`：面向所有 AI Agent 的编码规范与约束（Claude Code / Codex 通用）

**优先级**: `.agents/skills/` 中的约束 > `.claude/skills/` 中的流程 > 通用常识。
