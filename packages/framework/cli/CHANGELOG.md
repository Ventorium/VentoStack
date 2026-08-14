# @ventostack/cli

## 0.1.2

### Patch Changes

- [`21a8e9d`](https://github.com/Ventorium/VentoStack/commit/21a8e9d9de1c9797e6b4fccb1b90c6f14875dbf7) Thanks [@erguotou520](https://github.com/erguotou520)! - 修复 CLI bin 入口无法运行的问题：`run()` 注册内置命令（create/generate/migrate/password），`index.ts` 添加 `import.meta.main` 进程入口；脚手架模板 `package.json` 补充 `@ventostack/core` 依赖，生成的项目可直接 `bun install && bun run dev`。

## 0.1.1

### Patch Changes

- [#1](https://github.com/Ventorium/VentoStack/pull/1) [`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35) Thanks [@erguotou520](https://github.com/erguotou520)! - Prepare every framework and platform package for compiled npm distribution, document each
  package, and add secure database-backed AI provider and model resolution.
- Updated dependencies [[`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35)]:
  - @ventostack/core@0.1.1
  - @ventostack/database@0.1.1
