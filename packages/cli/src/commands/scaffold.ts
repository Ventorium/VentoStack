// @aeron/cli - 项目初始化脚手架（scaffold）

import type { Command } from "../cli";

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
      dependencies: {},
      devDependencies: {
        "@types/bun": "latest",
        typescript: "^5",
      },
    },
    null,
    2,
  );

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

const INDEX_TEMPLATE = `// ${"{app_name}"} - powered by Aeron
import { createApp, createRouter } from "@aeron/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello from Aeron!" });
});

router.get("/health", async (ctx) => {
  return ctx.json({ status: "ok", timestamp: Date.now() });
});

const app = createApp({ port: 3000 });
app.router.get("/", async (ctx) => ctx.json({ message: "Hello Aeron!" }));
app.router.get("/health", async (ctx) => ctx.json({ status: "ok" }));

await app.listen();
console.log("Server running on http://localhost:3000");
`;

const GITIGNORE_TEMPLATE = `node_modules/
dist/
.env
.env.*
!.env.example
*.log
`;

const ENV_EXAMPLE_TEMPLATE = `# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgres://localhost:5432/myapp

# Auth
JWT_SECRET=change-me-in-production
`;

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

export interface ScaffoldOptions {
  name: string;
  directory: string;
  template?: "minimal" | "full";
}

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

export function createScaffoldCommand(): Command {
  return {
    name: "create",
    description: "Create a new Aeron project",
    options: [
      { name: "name", alias: "n", description: "Project name", required: true },
      { name: "template", alias: "t", description: "Template (minimal | full)", default: "minimal" },
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

      console.log(`Creating Aeron project "${name}" in ${directory}...`);
      const files = await scaffold({ name, directory, template });
      console.log(`Created ${files.length} files.`);
      console.log("\nNext steps:");
      console.log(`  cd ${directory}`);
      console.log("  bun install");
      console.log("  bun run dev");
    },
  };
}
