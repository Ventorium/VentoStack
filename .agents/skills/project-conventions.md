---
name: project-conventions
description: |
  VentoStack 项目全局约定速查。适用于所有模块的通用规范：
  命名、类型、错误处理、测试、Git、文档、依赖选择。
---

# Project Conventions — 全局约定速查

## 命名规范

| 层级 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `user-service.ts`, `auth-guard.ts` |
| 函数名 | camelCase | `createUserService`, `handleRequest` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 接口/类型 | PascalCase | `UserService`, `CreateUserParams` |
| 工厂函数 | create + PascalCase | `createRouter`, `createPlatform` |
| 测试文件 | 同目录 + `.test.ts` | `user-service.test.ts` |

## 类型安全

- 所有公共 API 必须有显式返回类型
- 禁止 `any`，特殊情况用 `unknown` + 窄化
- 泛型必须有约束：`function foo<T extends string>(x: T)`
- 配置对象必须定义接口，不 inline 推断

## 错误处理

- 所有可能失败的异步操作必须处理错误
- 自定义错误类必须包含 `code` 和 `status`
- 错误链保留原始错误（`cause`），不吞掉堆栈
- 对外暴露的错误信息必须脱敏

```typescript
// ✅ 正确
try {
  await riskyOperation();
} catch (err) {
  throw new ServerError("操作失败", { cause: err, code: "OPERATION_FAILED", status: 500 });
}

// ❌ 禁止
try {
  await riskyOperation();
} catch (err) {
  console.error(err);
  return { error: err.message }; // 泄露内部信息
}
```

## 函数式优先

- 优先纯函数，副作用显式标记
- 用高阶函数组合替代 class 继承
- Context 通过参数显式传递
- 异步用 `async/await`，不用回调风格

## 测试

- 框架: `bun:test`
- 每个公共函数必须有单元测试
- 每个 HTTP 端点必须有集成测试
- 认证、授权、租户隔离、签名校验、限流、上传限制必须有安全回归测试
- 数据库测试必须可隔离、可回滚、可重复执行
- 优先 mock 外部服务，不 mock 框架核心模块

## Git

- 不提交 `node_modules`、`.env`
- 必须提交 `bun.lock`
- 提交信息用中文，描述清楚变更内容
- 不创建新分支（除非用户要求）

## 文档

- 框架模块变更 → `apps/docs/src/content/docs/framework/`
- 平台模块变更 → `apps/docs/src/content/docs/platform/`
- Admin 应用变更 → `apps/docs/src/content/docs/admin/`
- 文档使用中文
- 代码示例必须可运行

## 依赖选择优先级

1. Bun 内置 API
2. Web 标准 API
3. Bun 的 Node 兼容 API
4. 第三方包（需说明理由）

## 交付前检查

- [ ] 类型检查通过 (`bun run typecheck`)
- [ ] 测试通过 (`bun test`)
- [ ] 安全关键路径有失败用例覆盖
- [ ] 默认配置在生产模式下不会以不安全方式启动
- [ ] 文档、示例、生成代码与实际行为一致
