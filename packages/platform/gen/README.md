# @ventostack/gen

VentoStack 的后台代码生成平台模块，根据数据库表元数据生成符合项目约定的模型、服务、路由、类型和测试代码。

## 核心能力

- 数据库表和字段元数据管理
- 表结构导入与生成配置维护
- Model、Service、Routes 和 Types 模板渲染
- 测试文件生成
- 生成预览、下载和管理路由
- 模块迁移及 `createGenModule()` 装配入口

## 使用边界

生成结果应进入代码评审，不能将数据库结构直接视为可信业务模型。生产环境应限制生成接口和文件写入权限。

```ts
import { createGenModule, type GenModuleDeps } from "@ventostack/gen";

declare const deps: GenModuleDeps;
const gen = createGenModule(deps);
```
