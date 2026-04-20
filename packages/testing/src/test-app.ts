// @aeron/testing - 测试应用工具

import type { AeronApp } from "@aeron/core";

export interface TestAppInstance {
  readonly app: AeronApp;
  readonly port: number;
  readonly baseUrl: string;
  close(): Promise<void>;
}

async function findFreePort(): Promise<number> {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response("");
    },
  });
  const { port } = server;
  server.stop(true);
  return port;
}

export async function createTestApp(app: AeronApp): Promise<TestAppInstance> {
  const port = await findFreePort();
  await app.listen(port);

  return {
    app,
    port,
    baseUrl: `http://localhost:${port}`,
    async close() {
      await app.close();
    },
  };
}
