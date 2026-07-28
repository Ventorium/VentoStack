# @ventostack/boot

VentoStack 平台层的组合入口，通过 `createPlatform()` 将认证、系统管理及可选业务模块装配为一个可挂载的平台实例。

## 核心能力

- 集中声明平台基础设施依赖
- 按模块开关装配平台能力
- 聚合各模块 Router、服务和生命周期
- 为 Admin API 提供稳定的 Composition Root
- 保持业务模块之间的依赖显式可见

## 使用边界

本包负责装配，不隐藏数据库、缓存、认证和安全配置。应用仍应在自己的入口创建基础设施并显式传入。

```ts
import { createPlatform, type PlatformConfig } from "@ventostack/boot";

declare const config: PlatformConfig;
const platform = createPlatform(config);
```
