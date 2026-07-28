# @ventostack/i18n

VentoStack 的服务端国际化平台模块，用于管理语言、翻译消息和运行时文本解析。

## 核心能力

- Locale 与 Message 数据模型
- 翻译消息增删改查
- 按语言和消息键查询
- 默认语言和回退语言策略
- 国际化管理 API
- 数据库迁移和平台模块装配

## 使用边界

本包提供服务端语言数据与翻译服务，不绑定具体前端 i18n 库。前端可通过 API 或生成流程同步语言资源。

```ts
import { createI18nModule, type I18nModuleDeps } from "@ventostack/i18n";

declare const deps: I18nModuleDeps;
const i18n = createI18nModule(deps);
```
