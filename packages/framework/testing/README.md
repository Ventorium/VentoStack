# @ventostack/testing

VentoStack 的测试辅助包，为框架包和业务模块提供一致的 HTTP、数据和安全测试工具。

## 核心能力

- 测试应用和无关网络细节的测试客户端
- Fixture 生命周期管理
- 类型化数据 Factory、序列值和随机值工具
- 数据库事务隔离与回滚
- 可替换的测试数据库容器接口
- 常见安全基线回归测试套件

## 使用边界

本包面向 `bun:test`。测试工具不会代替真实数据库、Redis、网络和部署环境的最终集成验收。

```ts
import { createApp } from "@ventostack/core";
import { createTestApp, createTestClient } from "@ventostack/testing";

const testApp = await createTestApp(createApp());
const client = createTestClient(testApp.baseUrl);
```
