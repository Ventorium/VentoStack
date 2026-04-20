// @aeron/cli - Generate Command

import type { Command } from "../cli";

function controllerTemplate(name: string): string {
  return `// ${name} Controller
import type { Context } from "@aeron/core";

export function create${name}Controller() {
  return {
    async index(ctx: Context): Promise<Response> {
      return ctx.json({ message: "List ${name}" });
    },

    async show(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Show ${name} \${id}\` });
    },

    async create(ctx: Context): Promise<Response> {
      return ctx.json({ message: "Create ${name}" }, 201);
    },

    async update(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Update ${name} \${id}\` });
    },

    async delete(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Delete ${name} \${id}\` });
    },
  };
}
`;
}

function modelTemplate(name: string): string {
  const tableName = name.toLowerCase() + "s";
  return `// ${name} Model
import { defineModel, column } from "@aeron/database";

export const ${name}Model = defineModel("${tableName}", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 255 }),
  createdAt: column.timestamp(),
  updatedAt: column.timestamp(),
});
`;
}

function migrationTemplate(name: string, timestamp: string): string {
  return `// Migration: ${name}
import type { Migration } from "@aeron/database";

export const migration: Migration = {
  name: "${timestamp}_${name}",

  async up(executor) {
    await executor(\`
      -- Add your migration SQL here
    \`);
  },

  async down(executor) {
    await executor(\`
      -- Add your rollback SQL here
    \`);
  },
};
`;
}

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export interface GenerateOptions {
  outputDir?: string;
  timestampFn?: () => string;
}

export function createGenerateCommand(opts?: GenerateOptions): Command {
  const outputDir = opts?.outputDir ?? process.cwd();
  const getTimestamp = opts?.timestampFn ?? generateTimestamp;

  return {
    name: "generate",
    description: "Generate code scaffolds (controller, model, migration)",
    action: async (args: Record<string, unknown>) => {
      const positional = (args._ as string[] | undefined) ?? [];
      const type = positional[0];
      const name = positional[1];

      if (!type || !name) {
        console.error("Usage: aeron generate <type> <name>");
        console.error("Types: controller, model, migration");
        return;
      }

      switch (type) {
        case "controller": {
          const fileName = `${name.toLowerCase()}.controller.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = controllerTemplate(name);
          await Bun.write(filePath, content);
          console.log(`Generated controller: ${filePath}`);
          break;
        }
        case "model": {
          const fileName = `${name.toLowerCase()}.model.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = modelTemplate(name);
          await Bun.write(filePath, content);
          console.log(`Generated model: ${filePath}`);
          break;
        }
        case "migration": {
          const timestamp = getTimestamp();
          const fileName = `${timestamp}_${name}.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = migrationTemplate(name, timestamp);
          await Bun.write(filePath, content);
          console.log(`Generated migration: ${filePath}`);
          break;
        }
        default:
          console.error(`Unknown type: ${type}`);
          console.error("Types: controller, model, migration");
      }
    },
  };
}
