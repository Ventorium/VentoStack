---
"@ventostack/cli": patch
---

修复 CLI bin 入口无法运行的问题：`run()` 注册内置命令（create/generate/migrate/password），`index.ts` 添加 `import.meta.main` 进程入口；脚手架模板 `package.json` 补充 `@ventostack/core` 依赖，生成的项目可直接 `bun install && bun run dev`。
