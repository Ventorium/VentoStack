# @ventostack/vite-bridge

VentoStack 后端与 Vite 开发服务器之间的轻量桥接层，用于改善全栈项目的本地开发体验。

## 核心能力

- 在开发模式下代理或转发前端资源请求
- 管理 Vite 开发服务器连接
- 支持可注入日志器和启动配置
- 将前端开发服务接入 VentoStack 应用生命周期

## 使用边界

本包主要用于开发环境，不负责生产静态资源构建、CDN 发布或反向代理配置。

```ts
import { createViteBridge } from "@ventostack/vite-bridge";

const bridge = await createViteBridge({ webDir: "./web" });
```
