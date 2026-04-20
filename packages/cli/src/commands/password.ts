// @aeron/cli - Password Command

import type { Command } from "../cli";

export function createPasswordCommand(): Command {
  return {
    name: "password",
    description: "Hash a password using Bun.password",
    action: async (args: Record<string, unknown>) => {
      const positional = (args._ as string[] | undefined) ?? [];
      const plaintext = positional[0];

      if (!plaintext) {
        console.error("Usage: aeron password <plaintext>");
        return;
      }

      const hash = await Bun.password.hash(plaintext);
      console.log(hash);
    },
  };
}
