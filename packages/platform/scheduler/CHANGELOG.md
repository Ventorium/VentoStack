# @ventostack/scheduler

## 0.1.2

### Patch Changes

- 补发剩余平台包，保证全量 @ventostack/\* 可经 npm 安装

  此前已发布的 0.1.x 产物在 dependencies 中残留 `workspace:*`，导致下游 `bun install` / `npm install` 无法解析。
  发布链已在 CI 中加入 `scripts/prepare-publish`，发布前把各包 `workspace:*` 重写为实际版本号。
  本次为尚未纳入版本变更的剩余包补齐 patch 版本，使全部 @ventostack/\* 都以可解析的依赖重新发布：

  - @ventostack/oauth：首次公开发布（OAuth 2.0 / OIDC 统一认证与 SSO，含 token 端点 `token_type` 收窄修复）
  - @ventostack/ai-trace：首次公开发布（AI 问答链路追踪，订阅 ai 模块事件流）
  - @ventostack/auth / integration / notification / openapi / scheduler：以修正后的依赖重新发布

- Updated dependencies [[`2d1aa08`](https://github.com/Ventorium/VentoStack/commit/2d1aa08485038145179fc6619ace9fefc77b6bda)]:
  - @ventostack/core@0.1.2
  - @ventostack/database@0.1.2
  - @ventostack/events@0.1.2
  - @ventostack/auth@0.1.2

## 0.1.1

### Patch Changes

- [#1](https://github.com/Ventorium/VentoStack/pull/1) [`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35) Thanks [@erguotou520](https://github.com/erguotou520)! - Prepare every framework and platform package for compiled npm distribution, document each
  package, and add secure database-backed AI provider and model resolution.
- Updated dependencies [[`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35)]:
  - @ventostack/auth@0.1.1
  - @ventostack/core@0.1.1
  - @ventostack/database@0.1.1
  - @ventostack/events@0.1.1
