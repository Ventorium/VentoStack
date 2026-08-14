/**
 * @ventostack/cli — 项目初始化脚手架（scaffold）
 *
 * 提供 create 命令，用于生成新的 VentoStack 项目目录结构，
 * 包含 package.json、tsconfig.json、入口文件、Dockerfile 等基础文件。
 */

import type { Command } from "../cli";

/**
 * 生成 package.json 模板内容
 * @param name - 项目名称
 * @returns package.json 内容字符串
 */
const PACKAGE_JSON_TEMPLATE = (name: string): string =>
  JSON.stringify(
    {
      name,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "bun run --watch src/index.ts",
        build: "bun build src/index.ts --outdir dist --target bun",
        test: "bun test",
        typecheck: "bunx tsc --noEmit",
      },
      dependencies: {
        "@ventostack/core": "latest",
      },
      devDependencies: {
        "@types/bun": "latest",
        typescript: "^5",
      },
    },
    null,
    2,
  );

/** tsconfig.json 模板内容 */
const TSCONFIG_TEMPLATE = JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noImplicitAny: true,
      strictNullChecks: true,
      noUncheckedIndexedAccess: true,
      types: ["bun-types"],
    },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

/**
 * 入口文件模板内容
 * 使用 {app_name} 作为占位符，后续会被替换为实际项目名
 */
const INDEX_TEMPLATE = `// ${"{app_name}"} - powered by VentoStack
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello from VentoStack!" });
});

router.get("/health", async (ctx) => {
  return ctx.json({ status: "ok", timestamp: Date.now() });
});

const app = createApp({ port: 3000 });
app.use(router);

await app.listen();
console.log("Server running on http://localhost:3000");
`;

/** .gitignore 模板内容 */
const GITIGNORE_TEMPLATE = `node_modules/
dist/
.env
.env.*
!.env.example
*.log
`;

/** .env.example 模板内容 */
const ENV_EXAMPLE_TEMPLATE = `# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgres://localhost:5432/myapp

# Auth
JWT_SECRET=change-me-in-production
`;

/** Dockerfile 模板内容 */
const DOCKERFILE_TEMPLATE = `FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY . .

USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
`;

/** 脚手架选项 */
export interface ScaffoldOptions {
  /** 项目名称 */
  name: string;
  /** 目标目录 */
  directory: string;
  /** 项目模板类型，minimal 为基础模板，full 包含路由和服务目录 */
  template?: "minimal" | "full";
}

/**
 * 执行脚手架，创建项目文件和目录
 * @param options - 脚手架配置选项
 * @returns 已创建的文件/目录路径列表
 */
export async function scaffold(options: ScaffoldOptions): Promise<string[]> {
  const { name, directory, template = "minimal" } = options;
  const created: string[] = [];

  const base = directory.endsWith("/") ? directory : `${directory}/`;

  // 创建目录结构
  const dirs = [`${base}src`];
  if (template === "full") {
    dirs.push(`${base}src/routes`, `${base}src/services`, `${base}tests`);
  }

  for (const dir of dirs) {
    await Bun.write(`${dir}/.gitkeep`, "");
    created.push(dir);
  }

  // package.json
  await Bun.write(`${base}package.json`, PACKAGE_JSON_TEMPLATE(name));
  created.push("package.json");

  // tsconfig.json
  await Bun.write(`${base}tsconfig.json`, TSCONFIG_TEMPLATE);
  created.push("tsconfig.json");

  // src/index.ts
  const indexContent = INDEX_TEMPLATE.replace("{app_name}", name);
  await Bun.write(`${base}src/index.ts`, indexContent);
  created.push("src/index.ts");

  // .gitignore
  await Bun.write(`${base}.gitignore`, GITIGNORE_TEMPLATE);
  created.push(".gitignore");

  // .env.example
  await Bun.write(`${base}.env.example`, ENV_EXAMPLE_TEMPLATE);
  created.push(".env.example");

  // Dockerfile
  await Bun.write(`${base}Dockerfile`, DOCKERFILE_TEMPLATE);
  created.push("Dockerfile");

  return created;
}

/**
 * 创建 create 命令
 * @returns create 命令实例
 */
export function createScaffoldCommand(): Command {
  return {
    name: "create",
    description: "Create a new VentoStack project",
    options: [
      { name: "name", alias: "n", description: "Project name", required: true },
      {
        name: "template",
        alias: "t",
        description: "Template (minimal | full)",
        default: "minimal",
      },
      { name: "directory", alias: "d", description: "Target directory" },
    ],
    async action(args) {
      const name = args.name as string | undefined;
      if (!name) {
        console.error("Error: --name is required");
        return;
      }
      const template = (args.template as "minimal" | "full") ?? "minimal";
      const directory = (args.directory as string) ?? `./${name}`;

      console.log(`Creating VentoStack project "${name}" in ${directory}...`);
      const files = await scaffold({ name, directory, template });
      console.log(`Created ${files.length} files.`);
      console.log("\nNext steps:");
      console.log(`  cd ${directory}`);
      console.log("  bun install");
      console.log("  bun run dev");
    },
  };
}
