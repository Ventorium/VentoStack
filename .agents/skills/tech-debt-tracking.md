---
name: tech-debt-tracking
description: |
  VentoStack 已知技术债务追踪。AI Agent 在编码时应避免引入新的同类债务，
  并在有机会时帮助消减现有债务。
---

# Tech Debt Tracking — 技术债务追踪

## P2 — 待处理

### 1. 前端 `types.ts` 手写接口 → OpenAPI 自动生成

- **位置**: `apps/admin/web/src/api/types.ts`, `apps/admin/web/src/api/schema.ts`
- **问题**: 大量 `any` 类型，前后端类型不同步
- **目标**: 从 `@ventostack/openapi` 生成的 spec 自动导出 TypeScript 类型
- **影响**: 类型安全、开发体验、维护成本

### 2. `schema.ts` 中 `any` 类型优化

- **位置**: `apps/admin/web/src/api/schema.ts`
- **问题**: 约 30+ 处 `any`
- **目标**: 替换为具体接口或从后端生成

## P3 — 待规划

### 3. workflow 模块增强（可视化设计器）

- **位置**: `packages/platform/workflow`
- **问题**: 当前为基础状态机实现，缺少可视化设计器支持
- **目标**: 提供拖拽式工作流设计能力

### 4. 平台模块测试覆盖不均衡

- **位置**: `packages/platform/*`
- **问题**: system（18 测试）vs gen/i18n/monitor/notification/scheduler/workflow（各 1 测试）
- **目标**: 所有平台模块至少达到 5 个测试文件

### 5. AI 模块框架层抽象

- **位置**: 缺少 `packages/framework/ai`
- **问题**: platform/ai 直接依赖 platform/auth，没有框架层基础抽象
- **目标**: 在 framework 层提供 Tool Registry、Prompt、Memory、Worker 隔离等基础能力

### 6. gRPC 生产级完善

- **位置**: `packages/framework/core/src/grpc.ts`
- **问题**: Bun 原生不支持 gRPC，依赖第三方包，测试覆盖待确认
- **目标**: 评估是否保留或替换为内部 RPC

## 新增债务预防

AI Agent 在编码时应：
- 不引入新的 `any` 类型
- 不跳过测试（新增功能必须带测试）
- 不绕过权限中间件工厂
- 不直接字符串拼接 SQL
- 不引入未经评审的第三方依赖

## 已决策项

### 7. gRPC 暂不实现

- **决策**: 暂不实现生产级 gRPC 支持
- **原因**: Bun 原生不支持 gRPC，需引入第三方包，与 Bun-First 原则冲突
- **替代方案**: 内部 RPC（`packages/framework/core/src/rpc.ts`）已满足服务间通信需求
- **记录时间**: 2026-05-29
- **重新评估条件**: Bun 原生支持 gRPC 或有高性能跨语言通信刚需时
