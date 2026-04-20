// @aeron/cli - Migrate Command

import type { Command } from "../cli";
import type { MigrationRunner } from "@aeron/database";

export interface MigrateOptions {
  runner?: MigrationRunner;
  outputDir?: string;
  timestampFn?: () => string;
}

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function migrationFileTemplate(name: string, timestamp: string): string {
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

export function createMigrateCommand(opts?: MigrateOptions): Command {
  const getTimestamp = opts?.timestampFn ?? generateTimestamp;
  const outputDir = opts?.outputDir ?? process.cwd();

  return {
    name: "migrate",
    description: "Run database migrations (up, down, status, generate)",
    options: [
      {
        name: "steps",
        alias: "s",
        description: "Number of migrations to roll back",
        default: "1",
      },
    ],
    action: async (args: Record<string, unknown>) => {
      const positional = (args._ as string[] | undefined) ?? [];
      const subcommand = positional[0];

      if (!subcommand) {
        console.error("Usage: aeron migrate <up|down|status|generate> [options]");
        return;
      }

      switch (subcommand) {
        case "up": {
          if (!opts?.runner) {
            console.error("No migration runner configured");
            return;
          }
          const executed = await opts.runner.up();
          if (executed.length === 0) {
            console.log("No pending migrations");
          } else {
            for (const name of executed) {
              console.log(`Migrated: ${name}`);
            }
            console.log(`Executed ${executed.length} migration(s)`);
          }
          break;
        }
        case "down": {
          if (!opts?.runner) {
            console.error("No migration runner configured");
            return;
          }
          const steps = Number(args.steps ?? 1);
          const rolledBack = await opts.runner.down(steps);
          if (rolledBack.length === 0) {
            console.log("No migrations to roll back");
          } else {
            for (const name of rolledBack) {
              console.log(`Rolled back: ${name}`);
            }
            console.log(`Rolled back ${rolledBack.length} migration(s)`);
          }
          break;
        }
        case "status": {
          if (!opts?.runner) {
            console.error("No migration runner configured");
            return;
          }
          const statuses = await opts.runner.status();
          if (statuses.length === 0) {
            console.log("No migrations found");
          } else {
            for (const s of statuses) {
              const status = s.executedAt ? `executed at ${s.executedAt.toISOString()}` : "pending";
              console.log(`${s.name}: ${status}`);
            }
          }
          break;
        }
        case "generate": {
          const name = positional[1];
          if (!name) {
            console.error("Usage: aeron migrate generate <name>");
            return;
          }
          const timestamp = getTimestamp();
          const fileName = `${timestamp}_${name}.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = migrationFileTemplate(name, timestamp);
          await Bun.write(filePath, content);
          console.log(`Generated migration: ${filePath}`);
          break;
        }
        default:
          console.error(`Unknown subcommand: ${subcommand}`);
          console.error("Usage: aeron migrate <up|down|status|generate> [options]");
      }
    },
  };
}
